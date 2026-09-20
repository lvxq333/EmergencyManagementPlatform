package com.risk.platform.risk;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RiskController.class)
class RiskControllerTest {
    @Autowired
    MockMvc mockMvc;

    @MockBean
    RiskService riskService;

    @Test
    void overviewReturnsDashboardShape() throws Exception {
        when(riskService.overview()).thenReturn(new RiskOverview(
                OffsetDateTime.parse("2026-06-22T10:20:30+08:00"),
                List.of(new RiskRegion("海淀区", 76, "low", "低风险")),
                new RiskSummary(1, 0, 0),
                List.of(new RiskMetric("甲烷浓度", 0.74, "%", "normal")),
                List.of()
        ));

        mockMvc.perform(get("/api/risk/overview"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.regions[0].name").value("海淀区"))
                .andExpect(jsonPath("$.regions[0].value").value(76))
                .andExpect(jsonPath("$.summary.low").value(1))
                .andExpect(jsonPath("$.metrics[0].unit").value("%"));
    }
}
