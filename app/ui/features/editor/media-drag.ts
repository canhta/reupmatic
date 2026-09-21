/** The drag payload type a Project media video row carries when dropped on the timeline; the
 *  TimelineStrip drop target only accepts this type, so an OS file drop is never mistaken for a
 *  placement (ticket 05, D-63). */
export const MEDIA_DRAG_TYPE = 'application/x-reupmatic-media';
