package com.risk.platform.role;

import com.risk.platform.common.MessageResponse;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
public class RoleController {
    private final RoleService roleService;

    public RoleController(RoleService roleService) {
        this.roleService = roleService;
    }

    @GetMapping("/api/roles")
    public List<RoleResponse> listRoles() {
        return roleService.listRoles();
    }

    @PostMapping("/api/roles")
    public Map<String, Object> createRole(@RequestBody RoleRequest request) {
        return roleService.createRole(request);
    }

    @PutMapping("/api/roles/{id}")
    public MessageResponse updateRole(@PathVariable Long id, @RequestBody RoleRequest request) {
        return roleService.updateRole(id, request);
    }

    @DeleteMapping("/api/roles/{id}")
    public MessageResponse deleteRole(@PathVariable Long id) {
        return roleService.deleteRole(id);
    }

    @GetMapping("/api/permissions")
    public List<PermissionResponse> listPermissions() {
        return roleService.listPermissions();
    }
}
