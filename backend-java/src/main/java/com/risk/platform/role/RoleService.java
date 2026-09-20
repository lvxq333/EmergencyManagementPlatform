package com.risk.platform.role;

import com.risk.platform.common.MessageResponse;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class RoleService {
    private final RoleRepository roleRepository;

    public RoleService(RoleRepository roleRepository) {
        this.roleRepository = roleRepository;
    }

    public List<RoleResponse> listRoles() {
        return roleRepository.listRoles();
    }

    public List<PermissionResponse> listPermissions() {
        return roleRepository.listPermissions();
    }

    public Map<String, Object> createRole(RoleRequest request) {
        return roleRepository.createRole(request);
    }

    public MessageResponse updateRole(Long id, RoleRequest request) {
        roleRepository.updateRole(id, request);
        return new MessageResponse("角色更新成功");
    }

    public MessageResponse deleteRole(Long id) {
        roleRepository.deleteRole(id);
        return new MessageResponse("角色删除成功");
    }
}
