import { ValidationOptions, registerDecorator } from 'class-validator';
import { isValidImei } from '../../../domain/devices/imei';

// RN-02: DTO-level guard (BE-10). Pair with @Transform(normalizeImei) so
// formatted input is accepted but persisted as 15 bare digits.
export function IsImei(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isImei',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: { message: 'RN-02: el IMEI debe tener 15 dígitos y un dígito verificador válido', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidImei(value),
      },
    });
  };
}
