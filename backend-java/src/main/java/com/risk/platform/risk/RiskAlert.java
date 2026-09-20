package com.risk.platform.risk;

public record RiskAlert(String region, int value, String level, String message, boolean handled) {
}
