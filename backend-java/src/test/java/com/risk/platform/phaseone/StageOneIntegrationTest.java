package com.risk.platform.phaseone;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.risk.platform.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties={
 "spring.datasource.url=jdbc:h2:mem:phaseone;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
 "spring.datasource.driver-class-name=org.h2.Driver","spring.datasource.username=sa","spring.datasource.password=",
 "spring.sql.init.mode=always","spring.sql.init.schema-locations=classpath:monitoring-auth.sql,classpath:db/phase1.sql",
 "risk-platform.redis-enabled=false","risk-platform.persist-risk-events=false","risk-platform.expose-internal-errors=false"
})
@AutoConfigureMockMvc
class StageOneIntegrationTest {
 @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired JdbcTemplate db; @Autowired JwtService jwt;
 String admin; long station,device;
 JsonNode call(MockHttpServletRequestBuilder req,Object body,int expected) throws Exception {
  req.header("Authorization",admin).contentType("application/json");if(body!=null)req.content(json.writeValueAsString(body));
  String text=mvc.perform(req).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();return text.isBlank()?json.nullNode():json.readTree(text);
 }
 @BeforeEach void setup() throws Exception {
  db.update("DELETE FROM audit_log");db.update("DELETE FROM observation_context");db.update("DELETE FROM import_staging");db.update("DELETE FROM import_job");db.update("DELETE FROM dataset_original_file");db.update("DELETE FROM dataset");db.update("DELETE FROM ingest_request_log");db.update("DELETE FROM device_credential");db.update("DELETE FROM device_pipeline_relation");db.update("DELETE FROM observation");db.update("DELETE FROM simulation_job");db.update("DELETE FROM device_profile");db.update("DELETE FROM device");db.update("DELETE FROM pipeline_segment");db.update("DELETE FROM station_profile");db.update("DELETE FROM station");
  admin="Bearer "+jwt.createToken(9001L,"monitor-admin");
  station=call(post("/api/stations"),Map.of("code","P1-STATION","name","阶段一站点","region","海淀","longitude",116.3,"latitude",39.9,"coordinateSystem","WGS84"),201).get("id").asLong();
  device=call(post("/api/devices"),Map.of("code","P1-DEVICE","name","阶段一设备","stationId",station,"deviceType","GNSS_DISPLACEMENT","metricCode","vertical_displacement","intervalSeconds",30),201).get("id").asLong();
 }
 @Test void deviceCredentialSupportsAuthenticatedContinuousRetryAndAudit() throws Exception {
  mvc.perform(get("/api/device-ingest/observations")).andExpect(status().isMethodNotAllowed());
  JsonNode credential=call(post("/api/devices/"+device+"/credentials"),null,200);String key=credential.get("deviceKey").asText();
  Map<String,Object> body=Map.of("deviceCode","P1-DEVICE","messageId","network-0001","eventTime",Instant.now().minusSeconds(1).toString(),"metricCode","vertical_displacement","value",1.75,"unit","mm","sourceType","REAL");
  var request=post("/api/device-ingest/observations").header("X-Device-Code","P1-DEVICE").header("X-Device-Key",key).contentType("application/json").content(json.writeValueAsString(body));
  JsonNode first=json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
  var retry=post("/api/device-ingest/observations").header("X-Device-Code","P1-DEVICE").header("X-Device-Key",key).contentType("application/json").content(json.writeValueAsString(body));
  JsonNode duplicate=json.readTree(mvc.perform(retry).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
  assertEquals(first.get("id").asLong(),duplicate.get("id").asLong());assertTrue(duplicate.get("duplicate").asBoolean());
  mvc.perform(post("/api/device-ingest/observations").header("X-Device-Code","P1-DEVICE").header("X-Device-Key","wrong").contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isUnauthorized());
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM observation WHERE source_type='REAL'",Integer.class));
  assertEquals(3,db.queryForObject("SELECT COUNT(*) FROM ingest_request_log",Integer.class));
  assertEquals("HTTP_DEVICE",db.queryForObject("SELECT ingest_method FROM observation_context",String.class));
 }
 @Test void pipelineRelationsPersistAndViewerCannotModify() throws Exception {
  long pipeline=call(post("/api/pipeline-segments"),Map.of("code","GAS-001","name","燃气一号段","pipelineType","GAS","region","海淀","lengthKm",2.5,"dataSource","建设台账","enabled",true),201).get("id").asLong();
  call(put("/api/devices/"+device+"/pipeline-segments"),Map.of("pipelineSegmentIds",new long[]{pipeline}),200);
  JsonNode devices=call(get("/api/devices"),null,200);assertEquals(pipeline,devices.get(0).get("pipelineSegmentIds").get(0).asLong());
  assertEquals("HTTP",devices.get(0).get("protocol").asText());
  JsonNode stations=call(get("/api/stations"),null,200);assertEquals("GNSS",stations.get(0).get("stationType").asText());assertTrue(stations.get(0).get("enabled").asBoolean());
  JsonNode metrics=call(get("/api/metrics/definitions"),null,200);assertEquals(-100000,metrics.get(0).get("minimumValue").asInt());
  call(post("/api/ingest/observations"),Map.of("deviceCode","P1-DEVICE","messageId","outside-range","eventTime",Instant.now().toString(),"metricCode","vertical_displacement","value",100001,"unit","mm","sourceType","SIMULATED"),400);
  admin="Bearer "+jwt.createToken(9002L,"monitor-viewer");call(post("/api/pipeline-segments"),Map.of("code","DENIED"),403);
 }
 @Test void csvIsValidatedBeforeAtomicPublishAndBadRowsStayOut() throws Exception {
  String good="device_code,message_id,event_time,metric_code,value,unit,source_type\nP1-DEVICE,file-1,"+Instant.now().minusSeconds(2)+",vertical_displacement,2.1,mm,REAL\n";
  MockMultipartFile goodFile=new MockMultipartFile("file","good.csv","text/csv",good.getBytes(StandardCharsets.UTF_8));
  String response=mvc.perform(multipart("/api/datasets/import-jobs").file(goodFile).param("code","DATA-001").param("name","真实位移数据").param("sourceType","REAL").param("useScope","阶段一测试").header("Authorization",admin)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
  JsonNode job=json.readTree(response);assertEquals("VALIDATED",job.get("status").asText());long dataset=job.get("dataset_id").asLong();assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM observation",Integer.class));
  JsonNode published=call(post("/api/datasets/"+dataset+"/publish"),null,200);assertEquals(1,published.get("inserted").asInt());assertEquals("CSV_IMPORT",db.queryForObject("SELECT ingest_method FROM observation_context",String.class));
  String bad="device_code,message_id,event_time,metric_code,value,unit,source_type\nP1-DEVICE,bad-1,not-a-time,vertical_displacement,2.1,m,REAL\n";
  MockMultipartFile badFile=new MockMultipartFile("file","bad.csv","text/csv",bad.getBytes(StandardCharsets.UTF_8));
  String badResponse=mvc.perform(multipart("/api/datasets/import-jobs").file(badFile).param("code","DATA-002").param("name","错误数据").param("sourceType","REAL").param("useScope","阶段一测试").header("Authorization",admin)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
  JsonNode badJob=json.readTree(badResponse);assertEquals("VALIDATION_FAILED",badJob.get("status").asText());assertEquals(1,badJob.get("error_rows").asInt());call(post("/api/datasets/"+badJob.get("dataset_id").asLong()+"/publish"),null,409);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM observation",Integer.class));
 }
}
