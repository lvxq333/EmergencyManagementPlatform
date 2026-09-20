package com.risk.platform.ingest;

import com.risk.platform.common.ApiException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class MonitoringController {
    private final MonitoringService service;
    private final JdbcTemplate db;
    private final javax.crypto.SecretKey key;
    public MonitoringController(MonitoringService service, JdbcTemplate db,
                                @Value("${risk-platform.jwt-secret}") String secret) {
        this.service=service; this.db=db;
        String padded=secret.length()>=32?secret:(secret+"00000000000000000000000000000000").substring(0,32);
        key=Keys.hmacShaKeyFor(padded.getBytes(StandardCharsets.UTF_8));
    }
    private long authorize(String header, boolean write, boolean admin) {
        long id;
        try {
            if (header==null || !header.startsWith("Bearer ")) throw new IllegalArgumentException();
            id=((Number)Jwts.parser().verifyWith(key).build().parseSignedClaims(header.substring(7))
                .getPayload().get("id")).longValue();
        } catch (Exception e) { throw new ApiException(HttpStatus.UNAUTHORIZED,"请使用Java后端重新登录"); }
        if (db.queryForObject("SELECT COUNT(*) FROM users WHERE id=? AND is_active=1", Integer.class,id)!=1)
            throw new ApiException(HttpStatus.UNAUTHORIZED,"账户不存在或已停用");
        boolean isAdmin=db.queryForObject("SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.role_name='Administrator'",Integer.class,id)>0;
        if (admin && !isAdmin) throw new ApiException(HttpStatus.FORBIDDEN,"仅管理员可以维护站点和设备");
        if (!isAdmin) {
            String permission=write?"data:input":"risk:view_all";
            int count=db.queryForObject("SELECT COUNT(*) FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=? AND p.permission_key=?",Integer.class,id,permission);
            if(count==0) throw new ApiException(HttpStatus.FORBIDDEN,"没有执行此操作的权限");
        }
        return id;
    }
    public record StationInput(String code,String name,String region,Double longitude,Double latitude,String coordinateSystem,String stationType,Boolean enabled) {}
    public record DeviceInput(String code,String name,Long stationId,String deviceType,String metricCode,Integer intervalSeconds,String protocol) {}
    public record StatusInput(Boolean enabled) {}
    public record ObservationInput(String deviceCode,String messageId,Instant eventTime,String metricCode,Double value,String unit,String sourceType) {}
    public record SimulationInput(Double baseValue,Double amplitude,Integer intervalSeconds) {}

    @GetMapping("/stations") public Object stations(@RequestHeader(value="Authorization",required=false) String auth) {authorize(auth,false,false);return service.stations();}
    @PostMapping("/stations") @ResponseStatus(HttpStatus.CREATED)
    public Object addStation(@RequestHeader(value="Authorization",required=false) String auth,@RequestBody StationInput input) {long user=authorize(auth,true,true);return service.saveStation(null,input,user);}
    @PutMapping("/stations/{id}") public Object editStation(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable long id,@RequestBody StationInput input) {long user=authorize(auth,true,true);return service.saveStation(id,input,user);}
    @GetMapping("/devices") public Object devices(@RequestHeader(value="Authorization",required=false) String auth) {authorize(auth,false,false);return service.devices();}
    @PostMapping("/devices") @ResponseStatus(HttpStatus.CREATED)
    public Object addDevice(@RequestHeader(value="Authorization",required=false) String auth,@RequestBody DeviceInput input) {long user=authorize(auth,true,true);return service.saveDevice(null,input,user);}
    @PutMapping("/devices/{id}") public Object editDevice(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable long id,@RequestBody DeviceInput input) {long user=authorize(auth,true,true);return service.saveDevice(id,input,user);}
    @PatchMapping("/devices/{id}/status") public Object status(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable long id,@RequestBody StatusInput input) {long user=authorize(auth,true,true);return service.status(id,input.enabled(),user);}
    @GetMapping("/metrics/definitions") public Object metrics(@RequestHeader(value="Authorization",required=false) String auth) {authorize(auth,false,false);return service.metrics();}
    @PostMapping("/ingest/observations") public Object ingest(@RequestHeader(value="Authorization",required=false) String auth,@RequestBody ObservationInput input) {long user=authorize(auth,true,false);return service.ingest(input,user);}
    @GetMapping("/devices/{id}/latest") public Object latest(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable long id) {authorize(auth,false,false);return service.latest(id);}
    @GetMapping("/devices/{id}/observations") public Object history(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable long id,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset) {authorize(auth,false,false);return service.history(id,limit,offset);}
    @PutMapping("/devices/{id}/simulation") public Object startSimulation(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable long id,@RequestBody SimulationInput input) {long user=authorize(auth,true,true);return service.configureSimulation(id,input,user);}
    @DeleteMapping("/devices/{id}/simulation") public Object stopSimulation(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable long id) {long user=authorize(auth,true,true);return service.stopSimulation(id,user);}
    @GetMapping("/monitoring/summary") public Object summary(@RequestHeader(value="Authorization",required=false) String auth) {authorize(auth,false,false);return service.summary();}
}
