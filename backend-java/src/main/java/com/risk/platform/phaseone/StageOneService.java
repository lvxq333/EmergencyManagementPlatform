package com.risk.platform.phaseone;

import com.risk.platform.common.ApiException;
import com.risk.platform.ingest.MonitoringController.ObservationInput;
import com.risk.platform.ingest.MonitoringService;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static com.risk.platform.phaseone.StageOneController.PipelineInput;

@Service
public class StageOneService {
    private static final Set<String> SOURCES=Set.of("REAL","SIMULATED","UNKNOWN");
    private static final Set<String> PIPELINES=Set.of("GAS","WATER","HEATING","OTHER");
    private final JdbcTemplate db;
    private final MonitoringService monitoring;
    private final SecureRandom random=new SecureRandom();

    public StageOneService(JdbcTemplate db, MonitoringService monitoring) {this.db=db;this.monitoring=monitoring;}
    private static ApiException bad(String m){return new ApiException(HttpStatus.BAD_REQUEST,m);}
    private static String text(String v,int max,String label){if(v==null||v.isBlank()||v.trim().length()>max)throw bad(label+"不能为空且长度不得超过"+max);return v.trim();}
    private static String code(String v){String x=text(v,64,"编号").toUpperCase(Locale.ROOT);if(!x.matches("[A-Z0-9_-]+"))throw bad("编号只允许字母、数字、下划线和短横线");return x;}
    private long insert(String sql,Object...args){var keys=new GeneratedKeyHolder();db.update(c->{var p=c.prepareStatement(sql,new String[]{"id"});for(int i=0;i<args.length;i++)p.setObject(i+1,args[i]);return p;},keys);return Objects.requireNonNull(keys.getKey()).longValue();}
    private void exists(String table,long id){if(db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE id=?",Integer.class,id)==0)throw new ApiException(HttpStatus.NOT_FOUND,"记录不存在");}
    private void audit(String actorType,Long actor,String action,String type,Object id,String detail){db.update("INSERT INTO audit_log(actor_type,actor_id,action,target_type,target_id,detail) VALUES(?,?,?,?,?,?)",actorType,actor,action,type,id==null?null:String.valueOf(id),detail);}
    private static String sha256(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}

    public List<Map<String,Object>> pipelines(){return db.query("SELECT p.*,(SELECT COUNT(*) FROM device_pipeline_relation r WHERE r.pipeline_segment_id=p.id) device_count FROM pipeline_segment p ORDER BY p.id DESC",(r,n)->{Map<String,Object> m=new LinkedHashMap<>();m.put("id",r.getLong("id"));m.put("code",r.getString("code"));m.put("name",r.getString("name"));m.put("pipelineType",r.getString("pipeline_type"));m.put("region",r.getString("region"));m.put("geometryJson",r.getString("geometry_json"));m.put("lengthKm",r.getDouble("length_km"));m.put("dataSource",r.getString("data_source"));m.put("enabled",r.getBoolean("enabled"));m.put("deviceCount",r.getLong("device_count"));return m;});}
    @Transactional public Object savePipeline(Long id,PipelineInput in,long user){
        boolean creating=id==null;
        String c=code(in.code()),name=text(in.name(),120,"管段名称"),type=text(in.pipelineType(),32,"管线类型").toUpperCase(Locale.ROOT),region=text(in.region(),120,"区域"),source=text(in.dataSource(),120,"数据来源");
        if(!PIPELINES.contains(type))throw bad("管线类型须为GAS、WATER、HEATING或OTHER");
        if(in.lengthKm()==null||!Double.isFinite(in.lengthKm())||in.lengthKm()<0)throw bad("管段长度不合法");
        String geometry=in.geometryJson()==null||in.geometryJson().isBlank()?null:in.geometryJson().trim();if(geometry!=null&&geometry.length()>20000)throw bad("管段几何数据过长");
        boolean enabled=in.enabled()==null||in.enabled();
        try{if(id==null)id=insert("INSERT INTO pipeline_segment(code,name,pipeline_type,region,geometry_json,length_km,data_source,enabled) VALUES(?,?,?,?,?,?,?,?)",c,name,type,region,geometry,in.lengthKm(),source,enabled);else{exists("pipeline_segment",id);db.update("UPDATE pipeline_segment SET code=?,name=?,pipeline_type=?,region=?,geometry_json=?,length_km=?,data_source=?,enabled=? WHERE id=?",c,name,type,region,geometry,in.lengthKm(),source,enabled,id);}}catch(DuplicateKeyException e){throw new ApiException(HttpStatus.CONFLICT,"管段编号已存在");}
        audit("USER",user,creating?"CREATE_PIPELINE":"UPDATE_PIPELINE","PIPELINE",id,c);return Map.of("id",id);
    }
    @Transactional public Object relatePipelines(long deviceId,List<Long> ids,long user){exists("device",deviceId);List<Long> clean=ids==null?List.of():ids.stream().filter(Objects::nonNull).distinct().toList();for(long id:clean)exists("pipeline_segment",id);db.update("DELETE FROM device_pipeline_relation WHERE device_id=?",deviceId);for(long id:clean)db.update("INSERT INTO device_pipeline_relation(device_id,pipeline_segment_id) VALUES(?,?)",deviceId,id);audit("USER",user,"RELATE_PIPELINES","DEVICE",deviceId,clean.toString());return Map.of("deviceId",deviceId,"pipelineSegmentIds",clean);}
    @Transactional public Object rotateCredential(long deviceId,long user){exists("device",deviceId);byte[] bytes=new byte[32];random.nextBytes(bytes);String secret="rp_"+Base64.getUrlEncoder().withoutPadding().encodeToString(bytes),hash=sha256(secret.getBytes(StandardCharsets.UTF_8)),prefix=secret.substring(0,10);if(db.queryForObject("SELECT COUNT(*) FROM device_credential WHERE device_id=?",Integer.class,deviceId)==0)db.update("INSERT INTO device_credential(device_id,key_hash,key_prefix,created_by) VALUES(?,?,?,?)",deviceId,hash,prefix,user);else db.update("UPDATE device_credential SET key_hash=?,key_prefix=?,enabled=TRUE,created_by=?,created_at=?,last_used_at=NULL WHERE device_id=?",hash,prefix,user,Timestamp.from(Instant.now()),deviceId);audit("USER",user,"ROTATE_DEVICE_CREDENTIAL","DEVICE",deviceId,prefix);return Map.of("deviceId",deviceId,"deviceKey",secret,"keyPrefix",prefix,"message","密钥只显示一次，请安全保存");}
    public List<Map<String,Object>> ingestLogs(int limit){if(limit<1||limit>500)throw bad("limit范围1至500");return db.query("SELECT id,device_id,device_code,message_id,status,http_status,detail,remote_address,created_at FROM ingest_request_log ORDER BY id DESC LIMIT ?",(r,n)->{Map<String,Object> m=new LinkedHashMap<>();m.put("id",r.getLong("id"));m.put("deviceId",r.getObject("device_id"));m.put("deviceCode",r.getString("device_code"));m.put("messageId",r.getString("message_id"));m.put("status",r.getString("status"));m.put("httpStatus",r.getInt("http_status"));m.put("detail",r.getString("detail"));m.put("remoteAddress",r.getString("remote_address"));m.put("createdAt",r.getTimestamp("created_at").toInstant());return m;},limit);}
    private void ingestLog(Long device,String code,String message,String status,int http,String detail,String remote){db.update("INSERT INTO ingest_request_log(device_id,device_code,message_id,status,http_status,detail,remote_address) VALUES(?,?,?,?,?,?,?)",device,code,message,status,http,detail==null?null:detail.substring(0,Math.min(255,detail.length())),remote);}
    public Object deviceIngest(String deviceCode,String secret,ObservationInput in,String remote){
        String normalized=deviceCode==null?null:deviceCode.trim().toUpperCase(Locale.ROOT);String message=in==null?null:in.messageId();Long deviceId=null;
        try{
            if(normalized==null||normalized.isBlank()||secret==null||secret.isBlank())throw new ApiException(HttpStatus.UNAUTHORIZED,"缺少设备编号或设备密钥");
            var devices=db.queryForList("SELECT id,code FROM device WHERE code=?",normalized);if(devices.isEmpty())throw new ApiException(HttpStatus.UNAUTHORIZED,"设备凭证无效");deviceId=((Number)devices.get(0).get("id")).longValue();
            var credentials=db.queryForList("SELECT * FROM device_credential WHERE device_id=? AND enabled=TRUE",deviceId);if(credentials.isEmpty())throw new ApiException(HttpStatus.UNAUTHORIZED,"设备凭证无效");
            byte[] expected=HexFormat.of().parseHex((String)credentials.get(0).get("key_hash")),actual=MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));if(!MessageDigest.isEqual(expected,actual))throw new ApiException(HttpStatus.UNAUTHORIZED,"设备凭证无效");
            long minuteCount=db.queryForObject("SELECT COUNT(*) FROM ingest_request_log WHERE device_id=? AND created_at>=?",Long.class,deviceId,Timestamp.from(Instant.now().minusSeconds(60)));if(minuteCount>=600)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"设备请求过于频繁");
            if(in==null||!normalized.equalsIgnoreCase(in.deviceCode()))throw bad("请求体设备编号必须与凭证设备一致");if(!"REAL".equals(in.sourceType())&&!"UNKNOWN".equals(in.sourceType()))throw bad("设备接口只接受REAL或UNKNOWN来源");
            long submittedBy=((Number)credentials.get(0).get("created_by")).longValue();Object result=monitoring.ingest(in,submittedBy);db.update("UPDATE device_credential SET last_used_at=? WHERE device_id=?",Timestamp.from(Instant.now()),deviceId);ensureContext(((Number)((Map<?,?>)result).get("id")).longValue(),null,"HTTP_DEVICE");ingestLog(deviceId,normalized,message,"ACCEPTED",200,null,remote);return result;
        }catch(ApiException e){ingestLog(deviceId,normalized,message,"REJECTED",e.status().value(),e.getMessage(),remote);throw e;}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    private void ensureContext(long observation,Long dataset,String method){
        if(db.queryForObject("SELECT COUNT(*) FROM observation_context WHERE observation_id=?",Integer.class,observation)==0)
            db.update("INSERT INTO observation_context(observation_id,dataset_id,ingest_method,quality_status) VALUES(?,?,?,'VALID')",observation,dataset,method);
        else
            db.update("UPDATE observation_context SET dataset_id=?,ingest_method=?,quality_status='VALID' WHERE observation_id=?",dataset,method,observation);
    }

    @Transactional public Object importCsv(String datasetCode,String name,String sourceType,String useScope,MultipartFile file,long user){
        String c=code(datasetCode),n=text(name,120,"数据集名称"),source=text(sourceType,16,"数据来源").toUpperCase(Locale.ROOT),scope=text(useScope,255,"使用范围");if(!SOURCES.contains(source))throw bad("数据来源须为REAL、SIMULATED或UNKNOWN");if(file==null||file.isEmpty())throw bad("请选择CSV文件");if(file.getSize()>5*1024*1024)throw bad("CSV文件不能超过5MB");String filename=Optional.ofNullable(file.getOriginalFilename()).orElse("observations.csv");if(!filename.toLowerCase(Locale.ROOT).endsWith(".csv"))throw bad("当前仅支持CSV文件");
        byte[] content;try{content=file.getBytes();}catch(IOException e){throw bad("无法读取上传文件");}
        long dataset;try{dataset=insert("INSERT INTO dataset(code,name,source_type,use_scope,status,original_filename,file_sha256,created_by) VALUES(?,?,?,?,'VALIDATING',?,?,?)",c,n,source,scope,filename,sha256(content),user);}catch(DuplicateKeyException e){throw new ApiException(HttpStatus.CONFLICT,"数据集编号已存在");}
        db.update("INSERT INTO dataset_original_file(dataset_id,content) VALUES(?,?)",dataset,content);long job=insert("INSERT INTO import_job(dataset_id,status) VALUES(?,'RUNNING')",dataset);int total=0,valid=0,errors=0;List<String> report=new ArrayList<>();Set<String> messages=new HashSet<>();
        try(Reader reader=new InputStreamReader(new ByteArrayInputStream(content),StandardCharsets.UTF_8);CSVParser parser=CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).setIgnoreEmptyLines(true).setTrim(true).build().parse(reader)){
            Set<String> required=Set.of("device_code","message_id","event_time","metric_code","value","unit","source_type");if(!parser.getHeaderMap().keySet().containsAll(required))throw bad("CSV表头必须包含"+String.join(",",required));
            for(CSVRecord row:parser){total++;String error=null,device=null,message=null,metric=null,unit=null,rowSource=null;Instant time=null;Double value=null;try{device=code(row.get("device_code"));message=text(row.get("message_id"),128,"消息ID");metric=text(row.get("metric_code"),64,"指标");unit=text(row.get("unit"),32,"单位");rowSource=text(row.get("source_type"),16,"来源").toUpperCase(Locale.ROOT);if(!rowSource.equals(source))throw bad("行来源与数据集来源不一致");time=Instant.parse(text(row.get("event_time"),64,"采集时间")).truncatedTo(ChronoUnit.MILLIS);if(time.isAfter(Instant.now().plusSeconds(60))||time.isBefore(Instant.parse("1971-01-01T00:00:00Z")))throw bad("采集时间无效");value=Double.valueOf(row.get("value"));if(!Double.isFinite(value))throw bad("监测值必须是有限数值");var d=db.queryForList("SELECT d.id,d.enabled,d.metric_code,m.unit FROM device d JOIN metric_definition m ON m.code=d.metric_code WHERE d.code=?",device);if(d.isEmpty())throw bad("未知设备");if(!Boolean.TRUE.equals(d.get(0).get("enabled")))throw bad("设备已停用");if(!metric.equals(d.get(0).get("metric_code")))throw bad("指标与设备配置不符");if(!unit.equals(d.get(0).get("unit")))throw bad("单位与指标定义不符");if(!messages.add(device+"\u0000"+message))throw bad("文件内消息ID重复");valid++;}catch(Exception e){error=e.getMessage()==null?"格式错误":e.getMessage();errors++;report.add("第"+(row.getRecordNumber()+1)+"行："+error);}db.update("INSERT INTO import_staging(job_id,row_number,device_code,message_id,event_time,metric_code,metric_value,unit,source_type,error_message) VALUES(?,?,?,?,?,?,?,?,?,?)",job,(int)row.getRecordNumber()+1,device,message,time==null?null:Timestamp.from(time),metric,value,unit,rowSource,error);}
        }catch(ApiException e){throw e;}catch(Exception e){throw bad("CSV解析失败："+e.getMessage());}
        String status=errors==0&&total>0?"VALIDATED":"VALIDATION_FAILED";String reportText=String.join("\n",report);db.update("UPDATE import_job SET status=?,total_rows=?,valid_rows=?,error_rows=?,error_report=?,completed_at=? WHERE id=?",status,total,valid,errors,reportText,Timestamp.from(Instant.now()),job);db.update("UPDATE dataset SET status=? WHERE id=?",status,dataset);audit("USER",user,"IMPORT_DATASET","DATASET",dataset,c+" "+status);return importJob(job);
    }
    public Object importJob(long id){exists("import_job",id);var job=new LinkedHashMap<>(db.queryForMap("SELECT j.*,d.code dataset_code,d.name dataset_name FROM import_job j JOIN dataset d ON d.id=j.dataset_id WHERE j.id=?",id));job.put("errors",db.queryForList("SELECT row_number,error_message FROM import_staging WHERE job_id=? AND error_message IS NOT NULL ORDER BY row_number LIMIT 100",id));return job;}
    public List<Map<String,Object>> datasets(){return db.queryForList("SELECT d.*,j.id import_job_id,j.total_rows,j.valid_rows,j.error_rows FROM dataset d LEFT JOIN import_job j ON j.dataset_id=d.id ORDER BY d.id DESC");}
    @Transactional public Object publish(long datasetId,long user){exists("dataset",datasetId);var dataset=db.queryForMap("SELECT * FROM dataset WHERE id=? FOR UPDATE",datasetId);if("PUBLISHED".equals(dataset.get("status")))return Map.of("datasetId",datasetId,"status","PUBLISHED","alreadyPublished",true);if(!"VALIDATED".equals(dataset.get("status")))throw new ApiException(HttpStatus.CONFLICT,"数据集存在校验错误，不能发布");long job=((Number)db.queryForMap("SELECT * FROM import_job WHERE dataset_id=?",datasetId).get("id")).longValue();int inserted=0,duplicates=0;for(var row:db.queryForList("SELECT * FROM import_staging WHERE job_id=? ORDER BY row_number",job)){ObservationInput in=new ObservationInput((String)row.get("device_code"),(String)row.get("message_id"),((Timestamp)row.get("event_time")).toInstant(),(String)row.get("metric_code"),((Number)row.get("metric_value")).doubleValue(),(String)row.get("unit"),(String)row.get("source_type"));Object result=monitoring.ingest(in,user);Map<?,?> map=(Map<?,?>)result;long observation=((Number)map.get("id")).longValue();ensureContext(observation,datasetId,"CSV_IMPORT");if(Boolean.TRUE.equals(map.get("duplicate")))duplicates++;else inserted++;}db.update("UPDATE dataset SET status='PUBLISHED',published_at=? WHERE id=?",Timestamp.from(Instant.now()),datasetId);audit("USER",user,"PUBLISH_DATASET","DATASET",datasetId,"inserted="+inserted+", duplicates="+duplicates);return Map.of("datasetId",datasetId,"status","PUBLISHED","inserted",inserted,"duplicates",duplicates);}
    public List<Map<String,Object>> auditLogs(int limit){if(limit<1||limit>500)throw bad("limit范围1至500");return db.queryForList("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?",limit);}
}
