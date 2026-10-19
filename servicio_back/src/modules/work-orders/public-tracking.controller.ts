import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTrackingRequestDto } from './dto/public-tracking.dto';
import { CustomerWorkOrderStatusDto } from './dto/work-order.response.dto';
import { WorkOrdersService } from './work-orders.service';

// SUP-05: anonymous customer lookup (second access mode next to the
// CUSTOMER login). Rate limited per IP against code guessing.
@ApiTags('public')
@Controller('public/tracking')
@UseGuards(ThrottlerGuard)
export class PublicTrackingController {
  constructor(private readonly service: WorkOrdersService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Consulta pública del estado de una OT con número + código de seguimiento (SUP-05, RN-14)' })
  @ApiResponse({ status: 200, type: CustomerWorkOrderStatusDto })
  @ApiResponse({ status: 400, description: 'Formato de número o código inválido' })
  @ApiResponse({ status: 404, description: 'OT inexistente o código incorrecto (mensaje único)' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos desde la misma IP' })
  track(@Body() dto: PublicTrackingRequestDto): Promise<CustomerWorkOrderStatusDto> {
    return this.service.trackPublicly(dto);
  }
}
