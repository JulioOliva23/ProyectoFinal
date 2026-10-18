import { Module } from '@nestjs/common';
import { SparePartRepository } from './repositories/spare-part.repository';
import { SparePartStockRepository } from './repositories/spare-part-stock.repository';
import { SparePartsController } from './spare-parts.controller';
import { SparePartsService } from './spare-parts.service';

// Spare Parts Inventory: catalog, compatibility, stock and kardex.
// SparePartStockRepository is exported for the work order Stock Guard hook,
// which must run inside the transition transaction.
@Module({
  controllers: [SparePartsController],
  providers: [SparePartRepository, SparePartStockRepository, SparePartsService],
  exports: [SparePartsService, SparePartStockRepository],
})
export class SparePartsModule {}
