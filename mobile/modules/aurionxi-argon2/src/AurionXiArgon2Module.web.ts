import { registerWebModule, NativeModule } from 'expo';

class AurionXiArgon2Module extends NativeModule<Record<string, never>> {
  async derivePinKeyAsync(): Promise<never> {
    throw new Error('AurionXi Argon2 is available only in native Android builds.');
  }
}

export default registerWebModule(AurionXiArgon2Module, 'AurionXiArgon2');
