package com.risk.platform.auth;

import com.risk.platform.common.ApiException;
import com.risk.platform.user.UserRepository;
import com.risk.platform.user.UserRow;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthServiceTest {
 @Test void disabledAccountCannotLoginEvenWithCorrectPassword() {
  UserRepository users=mock(UserRepository.class);PasswordEncoder encoder=mock(PasswordEncoder.class);JwtService jwt=mock(JwtService.class);
  when(users.findByUsername("disabled")).thenReturn(Optional.of(new UserRow(1L,"disabled","hash","停用用户",null,null,false)));
  when(encoder.matches("correct","hash")).thenReturn(true);
  AuthService service=new AuthService(users,encoder,jwt);
  assertThrows(ApiException.class,()->service.login(new LoginRequest("disabled","correct")));
  verify(jwt,never()).createToken(anyLong(),anyString());
 }
 @Test void activeAccountReceivesTokenAndRegistrationRejectsWeakInput() {
  UserRepository users=mock(UserRepository.class);PasswordEncoder encoder=mock(PasswordEncoder.class);JwtService jwt=mock(JwtService.class);
  when(users.findByUsername("active")).thenReturn(Optional.of(new UserRow(2L,"active","hash","正常用户",null,null,true)));
  when(encoder.matches("correct-pass","hash")).thenReturn(true);when(users.findRoleNames(2L)).thenReturn(List.of("Viewer"));when(jwt.createToken(2L,"active")).thenReturn("token");
  AuthService service=new AuthService(users,encoder,jwt);assertEquals("token",service.login(new LoginRequest("active","correct-pass")).token());
  assertThrows(ApiException.class,()->service.register(new RegisterRequest("x","short","姓名")));
 }
}
