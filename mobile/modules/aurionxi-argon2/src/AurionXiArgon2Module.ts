import { NativeModule, requireNativeModule } from 'expo';

declare class AurionXiArgon2Module extends NativeModule<Record<string, never>> {
  derivePinKeyAsync(pin: string, saltHex: string): Promise<string>;
}

export default requireNativeModule<AurionXiArgon2Module>('AurionXiArgon2');
