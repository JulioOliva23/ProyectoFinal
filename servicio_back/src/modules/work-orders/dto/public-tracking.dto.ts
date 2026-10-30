import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Matches, Max, Min } from 'class-validator';
import { TRACKING_CODE_PATTERN, normalizeTrackingCode, parseWorkOrderNumber } from '../../../domain/work-orders/tracking-code';

// SUP-05: anonymous lookup. Accepts the formats printed on the ticket.
export class PublicTrackingRequestDto {
  @ApiProperty({ example: 'OT-000123', description: 'Número de OT (acepta "OT-000123", "000123" o 123)' })
  @Transform(({ value }) => (typeof value === 'string' || typeof value === 'number' ? parseWorkOrderNumber(value) : value))
  @IsInt({ message: 'El número debe ser un número de orden, por ejemplo OT-000123' })
  @Min(1)
  @Max(2_147_483_647)
  number!: number;

  @ApiProperty({ example: 'K7QM-3XPA', description: 'Código de seguimiento del ticket (no es el PIN del celular)' })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeTrackingCode(value) : value))
  @Matches(TRACKING_CODE_PATTERN, { message: 'El código debe ser el de 8 caracteres impreso en el ticket' })
  trackingCode!: string;
}
