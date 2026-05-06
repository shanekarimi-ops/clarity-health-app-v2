import { SupabaseClient } from '@supabase/supabase-js';

export type AuditEventType =
  | 'broker_invited'
  | 'invite_cancelled'
  | 'invite_accepted'
  | 'role_changed'
  | 'broker_removed'
  | 'ownership_transferred'
  | 'clients_reassigned'
  | 'branding_updated';

export async function logAuditEvent(
  supabaseAdmin: SupabaseClient,
  params: {
    agency_id: string;
    event_type: AuditEventType;
    actor_user_id: string;
    details: Record<string, any>;
  }
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('agency_audit_log')
      .insert({
        agency_id: params.agency_id,
        event_type: params.event_type,
        actor_user_id: params.actor_user_id,
        details: params.details,
      });

    if (error) {
      console.error('Audit log insert failed:', error, params);
    }
  } catch (err) {
    console.error('Audit log exception:', err, params);
  }
}