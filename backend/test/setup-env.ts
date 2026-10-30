import { TEST_ENV } from './test-env';

// Se fuerza siempre (aunque exista backend/.env) para no tocar la base de desarrollo.
Object.assign(process.env, TEST_ENV);
