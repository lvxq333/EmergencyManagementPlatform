package com.risk.platform.role;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Repository
public class RoleRepository {
    private final JdbcTemplate jdbcTemplate;

    public RoleRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<RoleResponse> listRoles() {
        return jdbcTemplate.query("SELECT * FROM roles ORDER BY id", (rs, rowNum) -> new RoleResponse(
                rs.getLong("id"),
                rs.getString("role_name"),
                rs.getString("description"),
                rs.getObject("created_at", LocalDateTime.class),
                findPermissionIds(rs.getLong("id"))
        ));
    }

    public List<PermissionResponse> listPermissions() {
        return jdbcTemplate.query("SELECT * FROM permissions ORDER BY id", (rs, rowNum) -> new PermissionResponse(
                rs.getLong("id"),
                rs.getString("permission_key"),
                rs.getString("permission_name"),
                rs.getString("module")
        ));
    }

    @Transactional
    public Map<String, Object> createRole(RoleRequest request) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO roles (role_name, description) VALUES (?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, request.roleName());
            ps.setString(2, request.description());
            return ps;
        }, keyHolder);
        Long roleId = Objects.requireNonNull(keyHolder.getKey()).longValue();
        replacePermissions(roleId, request.permissionIds());
        return Map.of("message", "角色创建成功", "id", roleId);
    }

    @Transactional
    public void updateRole(Long roleId, RoleRequest request) {
        jdbcTemplate.update(
                "UPDATE roles SET role_name = ?, description = ? WHERE id = ?",
                request.roleName(),
                request.description(),
                roleId
        );
        replacePermissions(roleId, request.permissionIds());
    }

    public void deleteRole(Long roleId) {
        jdbcTemplate.update("DELETE FROM roles WHERE id = ?", roleId);
    }

    private List<Long> findPermissionIds(Long roleId) {
        return jdbcTemplate.query(
                "SELECT permission_id FROM role_permissions WHERE role_id = ? ORDER BY permission_id",
                (rs, rowNum) -> rs.getLong("permission_id"),
                roleId
        );
    }

    private void replacePermissions(Long roleId, List<Long> permissionIds) {
        jdbcTemplate.update("DELETE FROM role_permissions WHERE role_id = ?", roleId);
        if (permissionIds == null || permissionIds.isEmpty()) {
            return;
        }
        jdbcTemplate.batchUpdate(
                "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
                permissionIds,
                permissionIds.size(),
                (ps, permissionId) -> {
                    ps.setLong(1, roleId);
                    ps.setLong(2, permissionId);
                }
        );
    }
}
