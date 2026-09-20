package com.risk.platform.user;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Repository
public class UserRepository {
    private static final RowMapper<UserRow> USER_MAPPER = (rs, rowNum) -> new UserRow(
            rs.getLong("id"),
            rs.getString("username"),
            rs.getString("password_hash"),
            rs.getString("real_name"),
            rs.getString("email"),
            rs.getString("phone"),
            rs.getInt("is_active") == 1
    );

    private final JdbcTemplate jdbcTemplate;

    public UserRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<UserRow> findByUsername(String username) {
        List<UserRow> rows = jdbcTemplate.query("SELECT * FROM users WHERE username = ?", USER_MAPPER, username);
        return rows.stream().findFirst();
    }

    public boolean existsByUsername(String username) {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users WHERE username = ?", Integer.class, username);
        return count != null && count > 0;
    }

    public List<UserRow> listUsers(String search) {
        if (search == null || search.isBlank()) {
            return jdbcTemplate.query("SELECT * FROM users ORDER BY created_at DESC", USER_MAPPER);
        }
        String fuzzy = "%" + search + "%";
        return jdbcTemplate.query(
                "SELECT * FROM users WHERE username LIKE ? OR real_name LIKE ? ORDER BY created_at DESC",
                USER_MAPPER,
                fuzzy,
                fuzzy
        );
    }

    public List<Long> findRoleIds(Long userId) {
        return jdbcTemplate.query("SELECT role_id FROM user_roles WHERE user_id = ?", (rs, rowNum) -> rs.getLong("role_id"), userId);
    }

    public List<String> findRoleNames(Long userId) {
        return jdbcTemplate.query("""
                SELECT r.role_name
                FROM roles r
                JOIN user_roles ur ON r.id = ur.role_id
                WHERE ur.user_id = ?
                ORDER BY r.id
                """, (rs, rowNum) -> rs.getString("role_name"), userId);
    }

    @Transactional
    public Long createUser(String username, String passwordHash, String realName, List<Long> roleIds) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO users (username, password_hash, real_name, is_active) VALUES (?, ?, ?, 1)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, username);
            ps.setString(2, passwordHash);
            ps.setString(3, realName);
            return ps;
        }, keyHolder);
        Long userId = Objects.requireNonNull(keyHolder.getKey()).longValue();
        replaceRoles(userId, roleIds);
        return userId;
    }

    @Transactional
    public void updateUser(Long userId, String username, String realName, String passwordHash, List<Long> roleIds) {
        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder("UPDATE users SET username = ?, real_name = ?");
        params.add(username);
        params.add(realName);
        if (passwordHash != null && !passwordHash.isBlank()) {
            sql.append(", password_hash = ?");
            params.add(passwordHash);
        }
        sql.append(" WHERE id = ?");
        params.add(userId);
        jdbcTemplate.update(sql.toString(), params.toArray());
        if (roleIds != null) {
            replaceRoles(userId, roleIds);
        }
    }

    public void deleteUser(Long userId) {
        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);
    }

    public void updateStatus(Long userId, boolean active) {
        jdbcTemplate.update("UPDATE users SET is_active = ? WHERE id = ?", active ? 1 : 0, userId);
    }

    private void replaceRoles(Long userId, List<Long> roleIds) {
        jdbcTemplate.update("DELETE FROM user_roles WHERE user_id = ?", userId);
        if (roleIds == null || roleIds.isEmpty()) {
            return;
        }
        jdbcTemplate.batchUpdate(
                "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
                roleIds,
                roleIds.size(),
                (ps, roleId) -> {
                    ps.setLong(1, userId);
                    ps.setLong(2, roleId);
                }
        );
    }
}
