package com.risk.platform.risk;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RiskService {
    private static final String REGIONS_KEY = "risk:regions:latest";
    private static final String METRICS_KEY = "risk:metrics:latest";
    private static final List<String> REGION_NAMES = List.of(
            "海淀区", "朝阳区", "丰台区", "石景山区", "通州区", "昌平区", "大兴区", "顺义区",
            "延庆区", "西城区", "东城区", "房山区", "门头沟区", "怀柔区", "密云区", "平谷区"
    );

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;
    private final boolean redisEnabled;
    private final boolean persistRiskEvents;
    private final Random random = new Random();
    private final Map<String, Integer> memoryRegions = new ConcurrentHashMap<>();
    private volatile List<RiskMetric> memoryMetrics = List.of();

    public RiskService(
            StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            JdbcTemplate jdbcTemplate,
            @Value("${risk-platform.redis-enabled:true}") boolean redisEnabled,
            @Value("${risk-platform.persist-risk-events:true}") boolean persistRiskEvents
    ) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.redisEnabled = redisEnabled;
        this.persistRiskEvents = persistRiskEvents;
    }

    public RiskOverview overview() {
        Map<String, Integer> current = loadRegions();
        Map<String, Integer> next = simulateRegions(current);
        List<RiskMetric> metrics = simulateMetrics(loadMetrics());
        saveRegions(next);
        saveMetrics(metrics);

        List<RiskRegion> regions = next.entrySet().stream()
                .map(entry -> toRegion(entry.getKey(), entry.getValue()))
                .toList();
        RiskSummary summary = summarize(regions);
        List<RiskAlert> alerts = regions.stream()
                .filter(region -> region.value() >= 80)
                .sorted(Comparator.comparingInt(RiskRegion::value).reversed())
                .map(region -> new RiskAlert(
                        region.name(),
                        region.value(),
                        region.level(),
                        region.name() + "风险值达到" + region.value() + "，" + ("high".equals(region.level()) ? "救援力量已出动。" : "持续监控中。"),
                        false
                ))
                .toList();
        persistSnapshot(summary, metrics, alerts);
        return new RiskOverview(OffsetDateTime.now(ZoneId.of("Asia/Shanghai")), regions, summary, metrics, alerts);
    }

    private Map<String, Integer> loadRegions() {
        try {
            if (!redisEnabled || redisTemplate == null) {
                throw new IllegalStateException("Redis disabled");
            }
            String json = redisTemplate.opsForValue().get(REGIONS_KEY);
            if (json != null && !json.isBlank()) {
                return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Integer>>() {});
            }
        } catch (Exception ignored) {
        }
        if (memoryRegions.isEmpty()) {
            REGION_NAMES.forEach(name -> memoryRegions.put(name, 35 + random.nextInt(35)));
        }
        return new LinkedHashMap<>(memoryRegions);
    }

    private void saveRegions(Map<String, Integer> regions) {
        memoryRegions.clear();
        memoryRegions.putAll(regions);
        try {
            if (!redisEnabled || redisTemplate == null) {
                return;
            }
            redisTemplate.opsForValue().set(REGIONS_KEY, objectMapper.writeValueAsString(regions));
        } catch (Exception ignored) {
        }
    }

    private List<RiskMetric> loadMetrics() {
        try {
            if (!redisEnabled || redisTemplate == null) {
                throw new IllegalStateException("Redis disabled");
            }
            String json = redisTemplate.opsForValue().get(METRICS_KEY);
            if (json != null && !json.isBlank()) {
                return objectMapper.readValue(json, new TypeReference<List<RiskMetric>>() {});
            }
        } catch (Exception ignored) {
        }
        return memoryMetrics;
    }

    private void saveMetrics(List<RiskMetric> metrics) {
        memoryMetrics = metrics;
        try {
            if (!redisEnabled || redisTemplate == null) {
                return;
            }
            redisTemplate.opsForValue().set(METRICS_KEY, objectMapper.writeValueAsString(metrics));
        } catch (Exception ignored) {
        }
    }

    private Map<String, Integer> simulateRegions(Map<String, Integer> current) {
        Map<String, Integer> next = new LinkedHashMap<>();
        for (String name : REGION_NAMES) {
            int value = current.getOrDefault(name, 35 + random.nextInt(35));
            int updated;
            if (value > 150 && random.nextDouble() < 0.30) {
                updated = value - (18 + random.nextInt(28));
            } else {
                int drift = random.nextInt(17) - 8;
                int trend = random.nextDouble() < 0.18 ? random.nextInt(10) : 0;
                updated = value + drift + trend;
            }
            next.put(name, clamp(updated, 10, 200));
        }
        return next;
    }

    private List<RiskMetric> simulateMetrics(List<RiskMetric> previous) {
        Map<String, RiskMetric> previousByName = new LinkedHashMap<>();
        previous.forEach(metric -> previousByName.put(metric.name(), metric));
        List<RiskMetric> metrics = new ArrayList<>();
        metrics.add(metric("甲烷浓度", previousByName.get("甲烷浓度"), 0.65, 0.95, 0.03, "%"));
        metrics.add(metric("管道压力", previousByName.get("管道压力"), 3.45, 3.85, 0.04, "MPa"));
        metrics.add(metric("地表位移", previousByName.get("地表位移"), 1.00, 2.20, 0.08, "mm"));
        metrics.add(metric("环境温度", previousByName.get("环境温度"), 23.5, 27.5, 0.25, "℃"));
        return metrics;
    }

    private RiskMetric metric(String name, RiskMetric previous, double min, double max, double step, String unit) {
        double base = previous == null ? min + random.nextDouble() * (max - min) : previous.value();
        double next = base + ((random.nextDouble() * 2) - 1) * step;
        double rounded = Math.round(clamp(next, min, max) * 100.0) / 100.0;
        return new RiskMetric(name, rounded, unit, "normal");
    }

    private RiskRegion toRegion(String name, int value) {
        if (value > 150) {
            return new RiskRegion(name, value, "high", "高风险");
        }
        if (value >= 80) {
            return new RiskRegion(name, value, "medium", "中风险");
        }
        return new RiskRegion(name, value, "low", "低风险");
    }

    private RiskSummary summarize(List<RiskRegion> regions) {
        int high = (int) regions.stream().filter(region -> "high".equals(region.level())).count();
        int medium = (int) regions.stream().filter(region -> "medium".equals(region.level())).count();
        return new RiskSummary(regions.size() - high - medium, medium, high);
    }

    private void persistSnapshot(RiskSummary summary, List<RiskMetric> metrics, List<RiskAlert> alerts) {
        try {
            if (!persistRiskEvents) {
                return;
            }
            jdbcTemplate.update(
                    "INSERT INTO risk_snapshots (summary_json, metrics_json) VALUES (?, ?)",
                    objectMapper.writeValueAsString(summary),
                    objectMapper.writeValueAsString(metrics)
            );
            for (RiskAlert alert : alerts) {
                jdbcTemplate.update(
                        "INSERT INTO risk_alerts (region_name, risk_value, risk_level, message, handled) VALUES (?, ?, ?, ?, ?)",
                        alert.region(), alert.value(), alert.level(), alert.message(), alert.handled() ? 1 : 0
                );
            }
        } catch (Exception ignored) {
        }
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
