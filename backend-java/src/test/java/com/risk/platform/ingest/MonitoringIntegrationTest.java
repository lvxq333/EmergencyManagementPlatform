package com.risk.platform.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.risk.platform.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.time.Instant;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={
 "spring.datasource.url=jdbc:h2:mem:monitoring;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
 "spring.datasource.driver-class-name=org.h2.Driver","spring.datasource.username=sa","spring.datasource.password=",
 "spring.sql.init.mode=always","spring.sql.init.schema-locations=classpath:monitoring-auth.sql,classpath:db/phase1.sql",
 "risk-platform.redis-enabled=false","risk-platform.persist-risk-events=false","risk-platform.expose-internal-errors=false"
})
@AutoConfigureMockMvc
class MonitoringIntegrationTest {
 @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired JdbcTemplate db; @Autowired JwtService jwt; @Autowired MonitoringService service;
 String admin; long station,device;
 JsonNode call(MockHttpServletRequestBuilder req,Object body,int status) throws Exception {
   req.header("Authorization",admin).contentType("application/json");
   if(body!=null)req.content(json.writeValueAsString(body));
   return json.readTree(mvc.perform(req).andExpect(status().is(status)).andReturn().getResponse().getContentAsString());
 }
 Map<String,Object> stationBody(String code) {return Map.of("code",code,"name","测试站","region","海淀","longitude",116.3,"latitude",39.9,"coordinateSystem","WGS84");}
 Map<String,Object> deviceBody(String code) {return Map.of("code",code,"name","位移设备","stationId",station,"deviceType","GNSS_DISPLACEMENT","metricCode","vertical_displacement","intervalSeconds",30);}
 Map<String,Object> observation(String message,String time,double value,String unit) {return Map.of("deviceCode","DISP-001","messageId",message,"eventTime",time,"metricCode","vertical_displacement","value",value,"unit",unit,"sourceType","SIMULATED");}
 @BeforeEach void setup() throws Exception {
   db.update("DELETE FROM observation_context");db.update("DELETE FROM import_staging");db.update("DELETE FROM import_job");db.update("DELETE FROM dataset_original_file");db.update("DELETE FROM dataset");db.update("DELETE FROM ingest_request_log");db.update("DELETE FROM device_credential");db.update("DELETE FROM device_pipeline_relation");db.update("DELETE FROM observation");db.update("DELETE FROM simulation_job");db.update("DELETE FROM device_profile");db.update("DELETE FROM device");db.update("DELETE FROM pipeline_segment");db.update("DELETE FROM station_profile");db.update("DELETE FROM station");
   admin="Bearer "+jwt.createToken(9001L,"monitor-admin");
   station=call(post("/api/stations"),stationBody("GNSS-001"),201).get("id").asLong();
   device=call(post("/api/devices"),deviceBody("DISP-001"),201).get("id").asLong();
 }
 @Test void fullFlowDuplicateConflictOutOfOrderAndHistory() throws Exception {
   String now=Instant.now().minusSeconds(3).toString(),older=Instant.now().minusSeconds(300).toString();
   var body=observation("session-1",now,1.62,"mm");
   long id=call(post("/api/ingest/observations"),body,200).get("id").asLong();
   var duplicate=call(post("/api/ingest/observations"),body,200);
   assertTrue(duplicate.get("duplicate").asBoolean());assertEquals(id,duplicate.get("id").asLong());
   call(post("/api/ingest/observations"),observation("session-1",now,9,"mm"),409);
   call(post("/api/ingest/observations"),observation("session-2",older,0.8,"mm"),200);
   var latest=call(get("/api/devices/"+device+"/latest"),null,200);
   assertEquals(1.62,latest.at("/observation/value").asDouble());
   var history=call(get("/api/devices/"+device+"/observations?limit=1&offset=1"),null,200);
   assertEquals(2,history.get("total").asInt());assertEquals(0.8,history.at("/items/0/value").asDouble());
   assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM observation",Integer.class));
 }
 @Test void validationAndDisabledDevice() throws Exception {
   String now=Instant.now().toString();
   call(post("/api/ingest/observations"),observation("bad-unit",now,2,"m"),400);
   var unknown=new java.util.HashMap<>(observation("unknown",now,2,"mm"));unknown.put("deviceCode","UNKNOWN");
   call(post("/api/ingest/observations"),unknown,404);
   call(post("/api/ingest/observations"),observation("future",Instant.now().plusSeconds(3600).toString(),2,"mm"),400);
   call(patch("/api/devices/"+device+"/status"),Map.of("enabled",false),200);
   call(post("/api/ingest/observations"),observation("disabled",now,2,"mm"),409);
   assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM observation",Integer.class));
   call(patch("/api/devices/"+device+"/status"),Map.of("enabled",true),200);
   call(post("/api/ingest/observations"),observation("enabled",now,2,"mm"),200);
 }
 @Test void authorization() throws Exception {
   mvc.perform(get("/api/stations")).andExpect(status().isUnauthorized());
   mvc.perform(get("/api/stations").header("Authorization","Bearer forged")).andExpect(status().isUnauthorized());
   admin="Bearer "+jwt.createToken(9002L,"monitor-viewer");
   call(get("/api/stations"),null,200);call(post("/api/stations"),stationBody("NEW"),403);
   call(post("/api/ingest/observations"),observation("forbidden",Instant.now().toString(),2,"mm"),403);
   admin="Bearer "+jwt.createToken(9003L,"disabled");call(get("/api/devices"),null,401);
 }
 @Test void persistenceManagementAndBadInputs() throws Exception {
   call(post("/api/stations"),stationBody("GNSS-001"),409);
   call(post("/api/devices"),deviceBody("DISP-001"),409);
   call(put("/api/stations/"+station),stationBody("GNSS-RENAMED"),200);
   assertEquals("GNSS-RENAMED",call(get("/api/stations"),null,200).get(0).get("code").asText());
   call(post("/api/ingest/observations"),observation("first",Instant.now().toString(),2,"mm"),200);
   call(put("/api/devices/"+device),deviceBody("REASSIGNED"),409);
   call(get("/api/devices/"+device+"/observations?limit=0"),null,400);
   call(get("/api/devices/999999/latest"),null,404);
   mvc.perform(post("/api/ingest/observations").header("Authorization",admin).contentType("application/json").content("{broken}")).andExpect(status().isBadRequest());
 }
 @Test void concurrentRetriesProduceOnlyOneObservation() throws Exception {
   var body=observation("concurrent",Instant.now().toString(),2,"mm");
   var pool=java.util.concurrent.Executors.newFixedThreadPool(4);
   try {
     var tasks=new java.util.ArrayList<java.util.concurrent.Callable<JsonNode>>();
     for(int i=0;i<8;i++)tasks.add(()->call(post("/api/ingest/observations"),body,200));
     var results=pool.invokeAll(tasks);
     long first=results.get(0).get().get("id").asLong();
     for(var result:results)assertEquals(first,result.get().get("id").asLong());
     assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM observation",Integer.class));
   }finally{pool.shutdownNow();}
 }
 @Test void automaticSimulationCanStartGenerateSummarizeAndStop() throws Exception {
   call(put("/api/devices/"+device+"/simulation"),Map.of("baseValue",10.0,"amplitude",2.0,"intervalSeconds",5),200);
   service.generateDueSimulationSamples();
   assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM observation WHERE source_type='SIMULATED'",Integer.class));
   assertEquals(10.0,call(get("/api/devices/"+device+"/latest"),null,200).at("/observation/value").asDouble());
   service.generateDueSimulationSamples();
   assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM observation",Integer.class));
   var summary=call(get("/api/monitoring/summary"),null,200);
   assertEquals(1,summary.get("runningSimulators").asInt());assertEquals(1,summary.at("/bySource/SIMULATED").asInt());
   call(delete("/api/devices/"+device+"/simulation"),null,200);
   assertFalse(call(get("/api/devices"),null,200).get(0).get("simulationEnabled").asBoolean());
 }
}
