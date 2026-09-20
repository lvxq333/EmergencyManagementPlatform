package com.risk.platform.auth;

import com.risk.platform.common.ApiException;
import com.risk.platform.user.UserRepository;
import com.risk.platform.user.UserRow;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        UserRow user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "用户名或密码错误"));
        if (!user.active() || !passwordEncoder.matches(request.password(), user.passwordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "用户名或密码错误");
        }
        List<String> roleNames = userRepository.findRoleNames(user.id());
        String token = jwtService.createToken(user.id(), user.username());
        return new LoginResponse(
                "登录成功",
                token,
                new LoginUserResponse(user.id(), user.username(), user.realName(), roleNames)
        );
    }

    public RegisterResponse register(RegisterRequest request) {
        if (request.username() == null || !request.username().matches("[A-Za-z0-9_-]{3,64}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "用户名须为3至64位字母、数字、下划线或短横线");
        }
        if (request.password() == null || request.password().length() < 8 || request.password().length() > 128) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "密码长度须为8至128位");
        }
        if (userRepository.existsByUsername(request.username())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "用户名已存在");
        }
        String passwordHash = passwordEncoder.encode(request.password());
        String realName = request.realName() == null ? "" : request.realName().trim();
        if (realName.length() > 64) throw new ApiException(HttpStatus.BAD_REQUEST, "姓名长度不得超过64位");
        Long userId = userRepository.createUser(request.username(), passwordHash, realName, List.of());
        return new RegisterResponse("注册成功", userId);
    }
}
