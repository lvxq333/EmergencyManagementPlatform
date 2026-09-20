package com.risk.platform.phaseone;

import com.risk.platform.common.PlatformAccessService;
import com.risk.platform.ingest.MonitoringController.ObservationInput;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api")
public class StageOneController {
    private final StageOneService service;
    private final PlatformAccessService access;

    public StageOneController(StageOneService service, PlatformAccessService access) {
        this.service = service;
        this.access = access;
    }

    public record PipelineInput(String code, String name, String pipelineType, String region,
                                String geometryJson, Double lengthKm, String dataSource, Boolean enabled) {}
    public record PipelineRelations(List<Long> pipelineSegmentIds) {}

    @GetMapping("/pipeline-segments")
    public Object pipelines(@RequestHeader(value="Authorization", required=false) String auth) {
        access.require(auth, "risk:view_all", false); return service.pipelines();
    }
    @PostMapping("/pipeline-segments") @ResponseStatus(HttpStatus.CREATED)
    public Object addPipeline(@RequestHeader(value="Authorization", required=false) String auth, @RequestBody PipelineInput input) {
        long user=access.require(auth, null, true); return service.savePipeline(null,input,user);
    }
    @PutMapping("/pipeline-segments/{id}")
    public Object editPipeline(@RequestHeader(value="Authorization", required=false) String auth,@PathVariable long id,@RequestBody PipelineInput input) {
        long user=access.require(auth,null,true); return service.savePipeline(id,input,user);
    }
    @PutMapping("/devices/{id}/pipeline-segments")
    public Object relatePipelines(@RequestHeader(value="Authorization", required=false) String auth,@PathVariable long id,@RequestBody PipelineRelations input) {
        long user=access.require(auth,null,true); return service.relatePipelines(id,input.pipelineSegmentIds(),user);
    }
    @PostMapping("/devices/{id}/credentials")
    public Object rotateCredential(@RequestHeader(value="Authorization", required=false) String auth,@PathVariable long id) {
        long user=access.require(auth,null,true); return service.rotateCredential(id,user);
    }
    @GetMapping("/device-ingest/logs")
    public Object ingestLogs(@RequestHeader(value="Authorization", required=false) String auth,@RequestParam(defaultValue="100") int limit) {
        access.require(auth,"risk:view_all",false); return service.ingestLogs(limit);
    }
    @PostMapping("/device-ingest/observations")
    public Object deviceIngest(@RequestHeader(value="X-Device-Code", required=false) String code,
                               @RequestHeader(value="X-Device-Key", required=false) String key,
                               @RequestBody ObservationInput input, HttpServletRequest request) {
        return service.deviceIngest(code,key,input,request.getRemoteAddr());
    }
    @GetMapping(value="/datasets/import-template",produces="text/csv")
    public ResponseEntity<byte[]> template(@RequestHeader(value="Authorization", required=false) String auth) {
        access.require(auth,"data:input",false);
        byte[] body=("device_code,message_id,event_time,metric_code,value,unit,source_type\n"+
                "DISP-001,device-session-000001,2026-09-20T03:00:00Z,vertical_displacement,1.62,mm,REAL\n").getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=observation-import-template.csv").body(body);
    }
    @PostMapping(value="/datasets/import-jobs",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @ResponseStatus(HttpStatus.CREATED)
    public Object importCsv(@RequestHeader(value="Authorization", required=false) String auth,
                            @RequestParam String code,@RequestParam String name,@RequestParam String sourceType,
                            @RequestParam String useScope,@RequestPart MultipartFile file) {
        long user=access.require(auth,"data:input",false); return service.importCsv(code,name,sourceType,useScope,file,user);
    }
    @GetMapping("/datasets/import-jobs/{id}")
    public Object importJob(@RequestHeader(value="Authorization", required=false) String auth,@PathVariable long id) {
        access.require(auth,"risk:view_all",false); return service.importJob(id);
    }
    @GetMapping("/datasets")
    public Object datasets(@RequestHeader(value="Authorization", required=false) String auth) {
        access.require(auth,"risk:view_all",false); return service.datasets();
    }
    @PostMapping("/datasets/{id}/publish")
    public Object publish(@RequestHeader(value="Authorization", required=false) String auth,@PathVariable long id) {
        long user=access.require(auth,null,true); return service.publish(id,user);
    }
    @GetMapping("/audit-logs")
    public Object auditLogs(@RequestHeader(value="Authorization", required=false) String auth,@RequestParam(defaultValue="100") int limit) {
        access.require(auth,null,true); return service.auditLogs(limit);
    }
}
