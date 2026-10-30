/** Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo. */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;
export const PASSWORD_MESSAGE =
  'La contraseña debe tener 12-128 caracteres con mayúscula, minúscula, número y símbolo';
