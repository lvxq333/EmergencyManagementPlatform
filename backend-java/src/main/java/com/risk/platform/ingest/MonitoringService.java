package com.risk.platform.ingest;

import com.risk.platform.common.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import static com.risk.platform.ingest.MonitoringController.*;

@Service
public class MonitoringService {
    private final JdbcTemplate db;
    public MonitoringService(JdbcTemplate db) {this.db=db;}
    private static ApiException bad(String message) {return new ApiException(HttpStatus.BAD_REQUEST,message);}
    private static String text(String value,int max,String label) {
        if(value==null || value.isBlank() || value.trim().length()>max) throw bad(label+"不能为空且长度不得超过"+max);
        return value.trim();
    }
    private static String code(String value,int max) {
        String v=text(value,max,"编号");
        if(!v.matches("[A-Za-z0-9_-]+")) throw bad("编号只允许英文字母、数字、下划线和短横线");
        return v.toUpperCase(Locale.ROOT);
    }
    private long insert(String sql,Object... args) {
        var keys=new GeneratedKeyHolder();
        db.update(c->{var p=c.prepareStatement(sql,new String[]{"id"});for(int i=0;i<args.length;i++)p.setObject(i+1,args[i]);return p;},keys);
        return Objects.requireNonNull(keys.getKey()).longValue();
    }
    private void exists(String table,long id) {
        if(db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE id=?",Integer.class,id)==0)
            throw new ApiException(HttpStatus.NOT_FOUND,"站点或设备不存在");
    }
    private final RowMapper<Map<String,Object>> stationRow=(r,n)->Map.of("id",r.getLong("id"),"code",r.getString("code"),"name",r.getString("name"),"region",r.getString("region"),"longitude",r.getDouble("longitude"),"latitude",r.getDouble("latitude"),"coordinateSystem",r.getString("coordinate_system"));
    public Object stations() {return db.query("SELECT * FROM station ORDER BY id DESC",stationRow);}
    @Transactional public Object saveStation(Long id,StationInput in) {
        String code=code(in.code(),64),name=text(in.name(),120,"站点名称"),region=text(in.region(),120,"区域"),crs=text(in.coordinateSystem(),32,"坐标系");
        if(in.longitude()==null || !Double.isFinite(in.longitude()) || Math.abs(in.longitude())>180 || in.latitude()==null || !Double.isFinite(in.latitude()) || Math.abs(in.latitude())>90) throw bad("经纬度不合法");
        if(!Set.of("WGS84","CGCS2000","GCJ02").contains(crs)) throw bad("不支持的坐标系");
        try {
            if(id==null) id=insert("INSERT INTO station(code,name,region,longitude,latitude,coordinate_system) VALUES(?,?,?,?,?,?)",code,name,region,in.longitude(),in.latitude(),crs);
            else {exists("station",id);db.update("UPDATE station SET code=?,name=?,region=?,longitude=?,latitude=?,coordinate_system=? WHERE id=?",code,name,region,in.longitude(),in.latitude(),crs,id);}
        }catch(DuplicateKeyException e){throw new ApiException(HttpStatus.CONFLICT,"站点编号已存在");}
        return Map.of("id",id);
    }
    public Object metrics() {return db.query("SELECT * FROM metric_definition ORDER BY code",(r,n)->Map.of("code",r.getString("code"),"name",r.getString("name"),"unit",r.getString("unit")));}
    public List<Map<String,Object>> devices() {
        return db.query("SELECT d.*,s.name station_name,m.unit,sj.enabled simulation_enabled,sj.base_value simulation_base,sj.amplitude simulation_amplitude,sj.interval_seconds simulation_interval,sj.last_run_at simulation_last_run,sj.last_status simulation_last_status,(SELECT MAX(o.received_at) FROM observation o WHERE o.device_id=d.id) last_received,(SELECT COUNT(*) FROM observation o WHERE o.device_id=d.id AND o.source_type='SIMULATED') simulated_count,(SELECT COUNT(*) FROM observation o WHERE o.device_id=d.id AND o.source_type='REAL') real_count FROM device d JOIN station s ON s.id=d.station_id JOIN metric_definition m ON m.code=d.metric_code LEFT JOIN simulation_job sj ON sj.device_id=d.id ORDER BY d.id DESC",(r,n)->{
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("id",r.getLong("id"));row.put("code",r.getString("code"));row.put("name",r.getString("name"));row.put("stationId",r.getLong("station_id"));row.put("stationName",r.getString("station_name"));row.put("deviceType",r.getString("device_type"));row.put("metricCode",r.getString("metric_code"));row.put("unit",r.getString("unit"));row.put("intervalSeconds",r.getInt("interval_seconds"));row.put("enabled",r.getBoolean("enabled"));
            Timestamp last=r.getTimestamp("last_received");row.put("lastReceivedAt",last==null?null:last.toInstant());
            row.put("communicationStatus",last==null?"NO_DATA":last.toInstant().isBefore(Instant.now().minusSeconds(r.getInt("interval_seconds")*3L))?"STALE":"RECENT");
            row.put("simulationEnabled",Boolean.TRUE.equals(r.getObject("simulation_enabled",Boolean.class)));
            row.put("simulationBase",r.getObject("simulation_base"));row.put("simulationAmplitude",r.getObject("simulation_amplitude"));row.put("simulationInterval",r.getObject("simulation_interval"));
            Timestamp simulationLast=r.getTimestamp("simulation_last_run");row.put("simulationLastRunAt",simulationLast==null?null:simulationLast.toInstant());row.put("simulationLastStatus",r.getString("simulation_last_status"));
            row.put("simulatedCount",r.getLong("simulated_count"));row.put("realCount",r.getLong("real_count"));return row;
        });
    }
    @Transactional public Object saveDevice(Long id,DeviceInput in) {
        String code=code(in.code(),64),name=text(in.name(),120,"设备名称"),type=text(in.deviceType(),64,"设备类型"),metric=text(in.metricCode(),64,"指标");
        if(in.stationId()==null)throw bad("请选择站点");exists("station",in.stationId());
        if(in.intervalSeconds()==null || in.intervalSeconds()<1 || in.intervalSeconds()>86400)throw bad("上报周期须为1至86400秒");
        if(db.queryForObject("SELECT COUNT(*) FROM metric_definition WHERE code=?",Integer.class,metric)==0)throw bad("未知监测指标");
        try {
            if(id==null) id=insert("INSERT INTO device(code,name,station_id,device_type,metric_code,interval_seconds) VALUES(?,?,?,?,?,?)",code,name,in.stationId(),type,metric,in.intervalSeconds());
            else {
                exists("device",id);
                var old=db.queryForMap("SELECT code,station_id,metric_code FROM device WHERE id=? FOR UPDATE",id);
                if(db.queryForObject("SELECT COUNT(*) FROM observation WHERE device_id=?",Integer.class,id)>0 && (!old.get("code").equals(code) || ((Number)old.get("station_id")).longValue()!=in.stationId() || !old.get("metric_code").equals(metric))) throw new ApiException(HttpStatus.CONFLICT,"已有数据的设备不能更换编号、站点或指标，请新建设备");
                db.update("UPDATE device SET code=?,name=?,station_id=?,device_type=?,metric_code=?,interval_seconds=? WHERE id=?",code,name,in.stationId(),type,metric,in.intervalSeconds(),id);
            }
        }catch(DuplicateKeyException e){throw new ApiException(HttpStatus.CONFLICT,"设备编号已存在");}
        return Map.of("id",id);
    }
    @Transactional public Object status(long id,Boolean enabled) {
        if(enabled==null)throw bad("enabled必须为布尔值");exists("device",id);db.update("UPDATE device SET enabled=? WHERE id=?",enabled,id);
        if(!enabled)db.update("UPDATE simulation_job SET enabled=FALSE,last_status='STOPPED',last_error='设备已停用',updated_at=? WHERE device_id=?",Timestamp.from(Instant.now()),id);
        return Map.of("id",id,"enabled",enabled);
    }
    private final RowMapper<Map<String,Object>> observationRow=(r,n)->{
        Map<String,Object> out=new LinkedHashMap<>();out.put("id",r.getLong("id"));out.put("messageId",r.getString("message_id"));out.put("deviceId",r.getLong("device_id"));out.put("eventTime",r.getTimestamp("event_time").toInstant());out.put("receivedAt",r.getTimestamp("received_at").toInstant());out.put("metricCode",r.getString("metric_code"));out.put("value",r.getDouble("metric_value"));out.put("unit",r.getString("unit"));out.put("sourceType",r.getString("source_type"));return out;
    };
    @Transactional public Object ingest(ObservationInput in,long user) {
        String device=code(in.deviceCode(),64),message=text(in.messageId(),128,"消息ID"),metric=text(in.metricCode(),64,"指标"),unit=text(in.unit(),32,"单位"),source=text(in.sourceType(),16,"数据来源");
        if(!Set.of("SIMULATED","REAL","UNKNOWN").contains(source))throw bad("来源必须为SIMULATED、REAL或UNKNOWN");
        if(in.value()==null || !Double.isFinite(in.value()))throw bad("监测值必须是有限数值");
        if(in.eventTime()==null || in.eventTime().isAfter(Instant.now().plusSeconds(60)) || in.eventTime().isBefore(Instant.parse("1971-01-01T00:00:00Z")))throw bad("采集时间无效或超前超过60秒");
        Instant time=in.eventTime().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        // Lock per device to serialize duplicate delivery and enable/disable changes.
        var rows=db.queryForList("SELECT * FROM device WHERE code=? FOR UPDATE",device);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"未知设备，请先登记");
        var d=rows.get(0);long id=((Number)d.get("id")).longValue();
        var previous=db.query("SELECT * FROM observation WHERE device_id=? AND message_id=?",observationRow,id,message);
        if(!previous.isEmpty()) {
            var p=previous.get(0);
            if(!p.get("eventTime").equals(time) || !p.get("metricCode").equals(metric) || Double.compare(((Number)p.get("value")).doubleValue(),in.value())!=0 || !p.get("unit").equals(unit) || !p.get("sourceType").equals(source)) throw new ApiException(HttpStatus.CONFLICT,"同一消息ID对应不同内容，请使用新消息ID");
            return Map.of("id",p.get("id"),"duplicate",true);
        }
        boolean enabled=db.queryForObject("SELECT enabled FROM device WHERE id=?",Boolean.class,id);
        if(!enabled)throw new ApiException(HttpStatus.CONFLICT,"设备已停用");
        if(!d.get("metric_code").equals(metric))throw bad("指标与设备配置不符");
        String expected=db.queryForObject("SELECT unit FROM metric_definition WHERE code=?",String.class,metric);
        if(!expected.equals(unit))throw bad("单位必须为"+expected+"，当前版本不进行隐式换算");
        long observation=insert("INSERT INTO observation(device_id,message_id,event_time,received_at,metric_code,metric_value,unit,source_type,submitted_by) VALUES(?,?,?,?,?,?,?,?,?)",id,message,Timestamp.from(time),Timestamp.from(Instant.now()),metric,in.value(),unit,source,user);
        return Map.of("id",observation,"duplicate",false);
    }
    public Object latest(long id) {
        exists("device",id);var rows=db.query("SELECT * FROM observation WHERE device_id=? ORDER BY event_time DESC,id DESC LIMIT 1",observationRow,id);
        Map<String,Object> out=new LinkedHashMap<>();out.put("observation",rows.isEmpty()?null:rows.get(0));return out;
    }
    public Object history(long id,int limit,int offset) {
        exists("device",id);if(limit<1 || limit>200 || offset<0)throw bad("limit范围1至200，offset不能为负数");
        return Map.of("items",db.query("SELECT * FROM observation WHERE device_id=? ORDER BY event_time DESC,id DESC LIMIT ? OFFSET ?",observationRow,id,limit,offset),"total",db.queryForObject("SELECT COUNT(*) FROM observation WHERE device_id=?",Long.class,id),"limit",limit,"offset",offset);
    }
    @Transactional public Object configureSimulation(long id,SimulationInput in,long user) {
        exists("device",id);
        if(in.baseValue()==null || !Double.isFinite(in.baseValue()) || Math.abs(in.baseValue())>1_000_000_000D)throw bad("模拟基准值不合法");
        if(in.amplitude()==null || !Double.isFinite(in.amplitude()) || in.amplitude()<0 || in.amplitude()>1_000_000_000D)throw bad("模拟波动幅度须为0至1000000000");
        if(in.intervalSeconds()==null || in.intervalSeconds()<1 || in.intervalSeconds()>86400)throw bad("模拟间隔须为1至86400秒");
        var device=db.queryForMap("SELECT enabled FROM device WHERE id=? FOR UPDATE",id);
        if(!Boolean.TRUE.equals(device.get("enabled")))throw new ApiException(HttpStatus.CONFLICT,"设备已停用，不能启动模拟器");
        Instant now=Instant.now();
        if(db.queryForObject("SELECT COUNT(*) FROM simulation_job WHERE device_id=?",Integer.class,id)==0)
            db.update("INSERT INTO simulation_job(device_id,enabled,base_value,amplitude,interval_seconds,next_run_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?)",id,true,in.baseValue(),in.amplitude(),in.intervalSeconds(),Timestamp.from(now),user,Timestamp.from(now));
        else db.update("UPDATE simulation_job SET enabled=TRUE,base_value=?,amplitude=?,interval_seconds=?,next_run_at=?,last_error=NULL,updated_by=?,updated_at=? WHERE device_id=?",in.baseValue(),in.amplitude(),in.intervalSeconds(),Timestamp.from(now),user,Timestamp.from(now),id);
        return Map.of("deviceId",id,"enabled",true);
    }
    @Transactional public Object stopSimulation(long id) {
        exists("device",id);db.update("UPDATE simulation_job SET enabled=FALSE,last_status='STOPPED',last_error=NULL,updated_at=? WHERE device_id=?",Timestamp.from(Instant.now()),id);
        return Map.of("deviceId",id,"enabled",false);
    }
    public Object summary() {
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("total",db.queryForObject("SELECT COUNT(*) FROM observation",Long.class));
        out.put("last24Hours",db.queryForObject("SELECT COUNT(*) FROM observation WHERE received_at>=?",Long.class,Timestamp.from(Instant.now().minusSeconds(86400))));
        Map<String,Long> sources=new LinkedHashMap<>();sources.put("SIMULATED",0L);sources.put("REAL",0L);sources.put("UNKNOWN",0L);
        db.query("SELECT source_type,COUNT(*) amount FROM observation GROUP BY source_type",r->{sources.put(r.getString("source_type"),r.getLong("amount"));});
        out.put("bySource",sources);out.put("runningSimulators",db.queryForObject("SELECT COUNT(*) FROM simulation_job WHERE enabled=TRUE",Long.class));return out;
    }
    @Transactional public void generateDueSimulationSamples() {
        Instant now=Instant.now();
        var due=db.queryForList("SELECT sj.*,d.code device_code,d.metric_code,m.unit,d.enabled device_enabled FROM simulation_job sj JOIN device d ON d.id=sj.device_id JOIN metric_definition m ON m.code=d.metric_code WHERE sj.enabled=TRUE AND sj.next_run_at<=? ORDER BY sj.next_run_at LIMIT 100 FOR UPDATE",Timestamp.from(now));
        for(var job:due) {
            long id=((Number)job.get("device_id")).longValue(),index=((Number)job.get("sample_index")).longValue();
            if(!Boolean.TRUE.equals(job.get("device_enabled"))) {db.update("UPDATE simulation_job SET enabled=FALSE,last_status='STOPPED',last_error='设备已停用',updated_at=? WHERE device_id=?",Timestamp.from(now),id);continue;}
            double base=((Number)job.get("base_value")).doubleValue(),amplitude=((Number)job.get("amplitude")).doubleValue();
            double value=base+amplitude*Math.sin(index*Math.PI/8D);
            String message="AUTO-"+id+"-"+index;
            insert("INSERT INTO observation(device_id,message_id,event_time,received_at,metric_code,metric_value,unit,source_type,submitted_by) VALUES(?,?,?,?,?,?,?,?,?)",id,message,Timestamp.from(now),Timestamp.from(now),job.get("metric_code"),value,job.get("unit"),"SIMULATED",job.get("updated_by"));
            int interval=((Number)job.get("interval_seconds")).intValue();
            db.update("UPDATE simulation_job SET sample_index=?,next_run_at=?,last_run_at=?,last_status='SUCCESS',last_error=NULL WHERE device_id=?",index+1,Timestamp.from(now.plusSeconds(interval)),Timestamp.from(now),id);
        }
    }
}
