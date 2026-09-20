package com.risk.platform.risk;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class RiskServiceTest {
    @Test
    void overviewReturnsBoundedRegionsAndMetricsWithoutRedisConnection() {
        RiskService service = new RiskService(null, new ObjectMapper(), mock(JdbcTemplate.class), false, false);

        RiskOverview overview = service.overview();

        assertThat(overview.regions()).hasSize(16);
        assertThat(overview.metrics()).hasSize(4);
        assertThat(overview.regions()).allSatisfy(region -> {
            assertThat(region.value()).isBetween(0, 200);
            assertThat(region.level()).isIn("low", "medium", "high");
        });
        assertThat(overview.summary().low() + overview.summary().medium() + overview.summary().high()).isEqualTo(16);
    }
}
