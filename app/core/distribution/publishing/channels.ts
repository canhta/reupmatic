import type { Channel, ChannelConnection, ChannelRecord } from '../distribution-contracts.js';
import { destinationAvailable } from './destinations.js';

export function channelWithConnection(
  record: ChannelRecord,
  connection: ChannelConnection,
): Channel {
  return {
    ...record,
    connection,
    can_publish: destinationAvailable(record.platform) && connection === 'connected',
  };
}
