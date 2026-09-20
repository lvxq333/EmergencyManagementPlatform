package com.risk.platform.common;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Service
public class PlatformAccessService {
    private final JdbcTemplate db;
    private final SecretKey key;

    public PlatformAccessService(JdbcTemplate db, @Value("${risk-platform.jwt-secret}") String secret) {
        this.db = db;
        String padded = secret.length() >= 32 ? secret : (secret + "00000000000000000000000000000000").substring(0, 32);
        this.key = Keys.hmacShaKeyFor(padded.getBytes(StandardCharsets.UTF_8));
    }

    public long require(String header, String permission, boolean adminOnly) {
        long id;
        try {
            if (header == null || !header.startsWith("Bearer ")) throw new IllegalArgumentException();
            id = ((Number) Jwts.parser().verifyWith(key).build().parseSignedClaims(header.substring(7))
                    .getPayload().get("id")).longValue();
        } catch (Exception e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "请重新登录");
        }
        if (db.queryForObject("SELECT COUNT(*) FROM users WHERE id=? AND is_active=1", Integer.class, id) != 1) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "账户不存在或已停用");
        }
        boolean admin = db.queryForObject("SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.role_name='Administrator'", Integer.class, id) > 0;
        if (adminOnly && !admin) throw new ApiException(HttpStatus.FORBIDDEN, "仅管理员可以执行此操作");
        if (!admin && permission != null) {
            int count = db.queryForObject("SELECT COUNT(*) FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=? AND p.permission_key=?", Integer.class, id, permission);
            if (count == 0) throw new ApiException(HttpStatus.FORBIDDEN, "没有执行此操作的权限");
        }
        return id;
    }
}
