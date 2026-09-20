package com.risk.platform.ingest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SimulationScheduler {
    private final MonitoringService service;
    private final boolean enabled;

    public SimulationScheduler(MonitoringService service,
            @Value("${risk-platform.simulator-enabled:false}") boolean enabled) {
        this.service = service;
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${risk-platform.simulator-scan-millis:1000}")
    public void tick() {
        if (enabled) service.generateDueSimulationSamples();
    }
}
