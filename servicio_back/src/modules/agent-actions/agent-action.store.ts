import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { AgentAction, AgentActionStatus } from '../../domain/agent-actions/agent-action-policy';

export interface AgentActionEvent {
  type: 'created' | 'updated';
  action: AgentAction;
}

// SUP-11: proposals live in memory. They are short-lived (AG-02), the API
// runs as a single instance, and what matters long-term (the executed
// transition, who approved it and why) is already written to the immutable
// audit trail (RN-12). A restart only drops undecided proposals.
const MAX_KEPT = 200;

@Injectable()
export class AgentActionStore {
  private readonly actions = new Map<string, AgentAction>();
  private readonly events = new Subject<AgentActionEvent>();

  get events$(): Observable<AgentActionEvent> {
    return this.events.asObservable();
  }

  create(action: AgentAction): AgentAction {
    this.actions.set(action.id, action);
    this.evictOldestDecided();
    this.events.next({ type: 'created', action });
    return action;
  }

  find(id: string): AgentAction | undefined {
    return this.actions.get(id);
  }

  update(id: string, changes: Partial<AgentAction>): AgentAction {
    const current = this.actions.get(id);
    if (!current) throw new Error(`Agent action ${id} not found`);
    const updated = { ...current, ...changes };
    this.actions.set(id, updated);
    this.events.next({ type: 'updated', action: updated });
    return updated;
  }

  list(): AgentAction[] {
    return [...this.actions.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private evictOldestDecided(): void {
    if (this.actions.size <= MAX_KEPT) return;
    const oldestDecided = [...this.actions.values()]
      .filter((action) => action.status !== AgentActionStatus.PENDING)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (oldestDecided) this.actions.delete(oldestDecided.id);
  }
}
