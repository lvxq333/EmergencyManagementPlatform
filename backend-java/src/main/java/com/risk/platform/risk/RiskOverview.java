package com.risk.platform.risk;

import java.time.OffsetDateTime;
import java.util.List;

public record RiskOverview(
        OffsetDateTime timestamp,
        List<RiskRegion> regions,
        RiskSummary summary,
        List<RiskMetric> metrics,
        List<RiskAlert> alerts
) {
}
