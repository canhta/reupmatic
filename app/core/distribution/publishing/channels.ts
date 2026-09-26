import type { Channel, ChannelConnectionState, ChannelRecord } from '../distribution-contracts.js';
import { destinationAvailable } from './destinations.js';

const DISCONNECTED: ChannelConnectionState = { connection: 'not_connected', account_name: null };

export function channelWithConnection(
  record: ChannelRecord,
  state: ChannelConnectionState = DISCONNECTED,
): Channel {
  return {
    ...record,
    connection: state.connection,
    account_name: state.account_name,
    can_publish: destinationAvailable(record.platform) && state.connection === 'connected',
  };
}
