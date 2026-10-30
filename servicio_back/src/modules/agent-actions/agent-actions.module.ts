import { Module } from '@nestjs/common';
import { WorkOrderTransitionsModule } from '../work-orders/work-order-transitions.module';
import { AgentActionStore } from './agent-action.store';
import { AgentActionsController } from './agent-actions.controller';
import { AgentActionsService } from './agent-actions.service';

// AG-01: proposals filed by AI agents (MCP server) and decided by people.
@Module({
  imports: [WorkOrderTransitionsModule],
  controllers: [AgentActionsController],
  providers: [AgentActionStore, AgentActionsService],
})
export class AgentActionsModule {}
