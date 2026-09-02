/**
 * CAD-specific SVG icons re-exported as Vue components via vite-svg-loader.
 *
 * Organised by category to mirror the AutoCAD icon taxonomy:
 *   - Primitive drawing (line, polyline, circle, arc, …)
 *   - Modification (move, offset, …)
 *   - Layer management
 *   - Annotation (mtext, hatch, …)
 *   - Measurement
 *   - Navigation (pan, zoom, …)
 *   - Utilities
 */

// ── primitive drawing ────────────────────────────────────────────────
export { default as iconLine } from './line.svg'
export { default as iconPolyline } from './polyline.svg'
export { default as iconRect } from './rect.svg'
export { default as iconPolygon } from './polygon.svg'
export { default as iconMline } from './mline.svg'
export { default as iconRay } from './ray.svg'
export { default as iconXline } from './xline.svg'
export { default as iconMultiPoints } from './multiPoints.svg'
export { default as iconMove } from './move.svg'
export { default as iconOffset } from './offset.svg'
export { default as iconSelect } from './select.svg'

// ── circle variants ──────────────────────────────────────────────────
export { default as iconCircle } from './circle.svg'
export { default as iconCircleCenterRadius } from './circle/circleCenterRadius.svg'
export { default as iconCircleCenterDiameter } from './circle/circleCenterDiameter.svg'
export { default as iconCircleTwoPoints } from './circle/circleTwoPoints.svg'
export { default as iconCircleThreePoints } from './circle/circleThreePoints.svg'
export { default as iconCircleTanTanRadius } from './circle/circleTanTanRadius.svg'
export { default as iconCircleTanTanTan } from './circle/circleTanTanTan.svg'

// ── arc variants ─────────────────────────────────────────────────────
export { default as iconArc } from './arc.svg'
export { default as iconArcThreePoints } from './arc/arcThreePoints.svg'
export { default as iconArcCenterStartEnd } from './arc/arcCenterStartEnd.svg'
export { default as iconArcCenterStartAngle } from './arc/arcCenterStartAngle.svg'
export { default as iconArcCenterStartLength } from './arc/arcCenterStartLength.svg'
export { default as iconArcStartCenterEnd } from './arc/arcStartCenterEnd.svg'
export { default as iconArcStartCenterAngle } from './arc/arcStartCenterAngle.svg'
export { default as iconArcStartCenterLength } from './arc/arcStartCenterLength.svg'
export { default as iconArcStartEndAngle } from './arc/arcStartEndAngle.svg'
export { default as iconArcStartEndDirection } from './arc/arcStartEndDirection.svg'
export { default as iconArcStartEndRadius } from './arc/arcStartEndRadius.svg'

// ── ellipse variants ─────────────────────────────────────────────────
export { default as iconEllipseCenter } from './ellipse/ellipseCenter.svg'
export { default as iconEllipseArc } from './ellipse/ellipseArc.svg'

// ── spline ───────────────────────────────────────────────────────────
export { default as iconSplineFitPoints } from './spline/splineFitPoints.svg'

// ── annotation ───────────────────────────────────────────────────────
export { default as iconMtext } from './mtext/mtext.svg'
export { default as iconHatch } from './hatch/hatch.svg'
export { default as iconHatchAssociative } from './hatch/hatchAssociative.svg'
export { default as iconDefineAttribute } from './defineAttribute.svg'
export { default as iconEditAttribute } from './editAttribute.svg'

// ── layer ────────────────────────────────────────────────────────────
export { default as iconLayer } from './layer.svg'
export { default as iconLayerIsolate } from './layer/layerIsolate.svg'
export { default as iconLayerUnisolate } from './layer/layerUnisolate.svg'
export { default as iconLayerOff } from './layer/layerOff.svg'
export { default as iconLayerOn } from './layer/layerOn.svg'
export { default as iconLayerFreeze } from './layer/layerFreeze.svg'
export { default as iconLayerThawed } from './layer/layerThawed.svg'
export { default as iconLayerLock } from './layer/layerLock.svg'
export { default as iconLayerUnlock } from './layer/layerUnlock.svg'
export { default as iconLayerCurrent } from './layer/layerCurrent.svg'
export { default as iconLayerPrevious } from './layer/layerPrevious.svg'
export { default as iconLayerSetCurrent } from './layer/layerSetCurrent.svg'

// ── measure ──────────────────────────────────────────────────────────
export { default as iconMeasure } from './measure/measure.svg'
export { default as iconMeasureDistance } from './measure/measureDistance.svg'
export { default as iconMeasureAngle } from './measure/measureAngle.svg'
export { default as iconMeasureArea } from './measure/measureArea.svg'
export { default as iconMeasureArc } from './measure/measureArc.svg'
export { default as iconMeasurePoint } from './measure/measurePoint.svg'
export { default as iconClearMeasurements } from './measure/clearMeasurements.svg'

// ── navigation ───────────────────────────────────────────────────────
export { default as iconPan } from './pan.svg'
export { default as iconZoomToExtent } from './zoomToExtent.svg'
export { default as iconZoomToBox } from './zoomToBox.svg'

// ── properties / utilities ───────────────────────────────────────────
export { default as iconProperties } from './properties.svg'
export { default as iconQselect } from './qselect.svg'
export { default as iconColor } from './color.svg'
export { default as iconLineStyle } from './lineStyle.svg'
export { default as iconLineWeight } from './lineWeight.svg'
export { default as iconInsertBlock } from './insertBlock.svg'
export { default as iconAttachImage } from './attachImage.svg'
export { default as iconAttachDwg } from './attachDwg.svg'
export { default as iconSwitchBg } from './switchBg.svg'
export { default as iconCountlist } from './countlist.svg'
export { default as iconExport } from './export.svg'
export { default as iconImport } from './import.svg'
export { default as iconSetting } from './setting.svg'

// ── markup / review ──────────────────────────────────────────────────
export { default as iconMarkupTools } from './markupTools.svg'
export { default as iconMarkupPanel } from './markupPanel.svg'
export { default as iconRevCircle } from './revCircle.svg'
export { default as iconRevCloud } from './revCloud.svg'
export { default as iconRevFreeDraw } from './revFreeDraw.svg'
export { default as iconRevRect } from './revRect.svg'

// ── status bar toggles ───────────────────────────────────────────────
export { default as iconOrthoMode } from './orthoMode.svg'
export { default as iconDynamicInput } from './dynamicInput.svg'
export { default as iconFullScreen } from './fullScreen.svg'
export { default as iconLanguage } from './language.svg'
export { default as iconOsnap } from './osnap.svg'
export { default as iconPolarTracking } from './polarTracking.svg'
