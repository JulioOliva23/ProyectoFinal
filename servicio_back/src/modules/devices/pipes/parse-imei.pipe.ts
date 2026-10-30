import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidImei, normalizeImei } from '../../../domain/devices/imei';

// RN-02: path parameter counterpart of @IsImei().
@Injectable()
export class ParseImeiPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const imei = normalizeImei(value ?? '');
    if (!isValidImei(imei)) {
      throw new BadRequestException('RN-02: el IMEI debe tener 15 dígitos y un dígito verificador válido');
    }
    return imei;
  }
}
