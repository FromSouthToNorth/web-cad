# @hy/graphic-interface

## 3.13.0

### Minor Changes

- feat: adds a session-scoped LOGINNAME system variable so drawings can expose the current login name, and fixes LibreDWG converter packaging so the wasm module is emitted beside the parser worker for reliable runtime loading

### Patch Changes

- Updated dependencies
  - @hy/common@1.13.0
  - @hy/geometry-engine@3.13.0

## 3.12.5

### Patch Changes

- feat: adds directBatchPrimitive for faster entity geometry batching, fixes OCS transforms for non-default extrusions so arcs and circles render correctly, and tolerates missing LibreDWG symbol and table names without throwing
- Updated dependencies
  - @hy/common@1.12.5
  - @hy/geometry-engine@3.12.5

## 3.12.4

### Patch Changes

- feat: speeds up drawing open by loading fonts on demand, skipping font work when no loader is set, streaming large-block font collection, batching font loads in parallel, and deferring mid-size block compaction
- Updated dependencies
  - @hy/common@1.12.4
  - @hy/geometry-engine@3.12.4

## 3.12.3

### Patch Changes

- feat: improve block rendering cache hits, trim font preload, and correctly apply ACIS body transforms to solid geometry
- Updated dependencies
  - @hy/common@1.12.3
  - @hy/geometry-engine@3.12.3

## 3.12.2

### Patch Changes

- feat: faster DWG/DXF parsing via zero-copy worker transfers and windowed UTF-8 decoding, plus private dwg-converter setup tooling
- Updated dependencies
  - @hy/common@1.12.2
  - @hy/geometry-engine@3.12.2

## 3.12.1

### Patch Changes

- feat: adds time-budgeted UI feedback, block-cache templates, MINSERT parameters, OLE2FRAME geometry, ByBlock ACI7, native DXF registration, and migrates GPL converters
- Updated dependencies
  - @hy/common@1.12.1
  - @hy/geometry-engine@3.12.1

## 3.12.0

### Minor Changes

- Fix xref import, add MIT DXF converter, attach ACDSDATA to 3DSOLIDs, and improve DXF open progress

### Patch Changes

- Updated dependencies
  - @hy/common@1.12.0
  - @hy/geometry-engine@3.12.0

## 3.11.3

### Patch Changes

- feat: support drawing thumbnails and viewport DCS-to-WCS mapping
- Updated dependencies
  - @hy/common@1.11.3
  - @hy/geometry-engine@3.11.3

## 3.11.2

### Patch Changes

- fix: draw ATTDEF per AutoCAD semantics and fix DXF flags
- Updated dependencies
  - @hy/common@1.11.2
  - @hy/geometry-engine@3.11.2

## 3.11.1

### Patch Changes

- feat: upgraded to Vite 6 & dxf-json 1.2.8, and improved data model by storing block PreviewIcons as bytes and fixed nested layer filter behavior
- Updated dependencies
  - @hy/common@1.11.1
  - @hy/geometry-engine@3.11.1

## 3.11.0

### Patch Changes

- feat: adds support for OLE frames and layer filters, improves image frame selection, assigns TEMP handles to unbound AcDbObjects, and refactors helper naming with consistent acdb/acge prefixes for better maintainability
- Updated dependencies
  - @hy/common@1.11.0
  - @hy/geometry-engine@3.11.0

## 3.10.7

### Patch Changes

- feat: added block cross-reference flags & unresolved detection, and improved data model flexibility by making the CLASSES conversion stage optional
- Updated dependencies
  - @hy/common@1.10.7
  - @hy/geometry-engine@3.10.7

## 3.10.6

### Patch Changes

- feat: improved DXF compatibility and data integrity with corrected group codes, CLASSES and SOLID export support, fixed proxy DXF codes, preserved SHAPE round-trip identity, and maintained circular arc endpoints when reversing loop edges
- Updated dependencies
  - @hy/common@1.10.6
  - @hy/geometry-engine@3.10.6

## 3.10.5

### Patch Changes

- feat: added a heuristic memory estimator for AcDbDatabase and fixed saved view restoration by correctly applying VPORT view target and twist, improving memory estimation and view consistency
- Updated dependencies
  - @hy/common@1.10.5
  - @hy/geometry-engine@3.10.5

## 3.10.4

### Patch Changes

- feat: sync latest upstream changes for ACIS SAB decoding, 3DSOLID wireframes, CI update, and FCF GDT/TOLERANCE improvements
- Updated dependencies
  - @hy/common@1.10.4
  - @hy/geometry-engine@3.10.4

## 3.10.3

### Patch Changes

- feat: add AcDbFcf and AcDb3dSolid
- Updated dependencies
  - @hy/common@1.10.3
  - @hy/geometry-engine@3.10.3

## 3.10.2

### Patch Changes

- feat: improved data model reliability with structured database error reporting, resilient font loading, accurate leader hook line rendering, and global handle registry to prevent cross-table handle collisions
- Updated dependencies
  - @hy/common@1.10.2
  - @hy/geometry-engine@3.10.2

## 3.10.1

### Patch Changes

- fix: improved AutoCAD compatibility by normalizing symbol table names and enhanced wide polyline fill rendering for self-overlapping paths
- Updated dependencies
  - @hy/common@1.10.1
  - @hy/geometry-engine@3.10.1

## 3.10.0

### Minor Changes

- feat: refactor symbol table storage with typed attributes, enforce write access controls, dispatch layerModified events, fix entityModified dispatch on commit, and resolve MLine grip issues for improved data integrity

### Patch Changes

- Updated dependencies
  - @hy/common@1.10.0
  - @hy/geometry-engine@3.10.0

## 3.5.14

### Patch Changes

- fix(data-model): correct transforms for dimensions, proxy entities, and block attributes
- Updated dependencies
  - @hy/common@1.6.14
  - @hy/geometry-engine@3.4.14

## 3.5.13

### Patch Changes

- feat(data-model): enhance grip editing with GRIPS sysvar and entity-specific grips
- Updated dependencies
  - @hy/common@1.6.13
  - @hy/geometry-engine@3.4.13

## 3.5.12

### Patch Changes

- feat(data-model,dxf-json-converter): add edit shortcuts and binary DXF parsing
- Updated dependencies
  - @hy/common@1.6.12
  - @hy/geometry-engine@3.4.12

## 3.5.11

### Patch Changes

- feat: implement database transaction manager with undo/redo
- Updated dependencies
  - @hy/common@1.6.11
  - @hy/geometry-engine@3.4.11

## 3.5.10

### Patch Changes

- feat: support reading AcDb2LineAngularDimension and add DWGNAME system variable
- Updated dependencies
  - @hy/common@1.6.10
  - @hy/geometry-engine@3.4.10

## 3.5.9

### Patch Changes

- feat: introduced grip point editing across entity types and unified DWG/DXF font collection through AcDbFontNameCollector for improved editing and font management consistency
- Updated dependencies
  - @hy/common@1.6.9
  - @hy/geometry-engine@3.4.9

## 3.5.8

### Patch Changes

- feat: improve SPLINE conversion with tolerant factory methods
- Updated dependencies
  - @hy/common@1.6.8
  - @hy/geometry-engine@3.4.8

## 3.5.7

### Patch Changes

- feat: improve LibreDWG converter with enhanced MLeader conversion and SHAPE entity support, and restore initial view from \*ACTIVE VPORT with added sanity checks for robustness
- Updated dependencies
  - @hy/common@1.6.7
  - @hy/geometry-engine@3.4.7

## 3.5.6

### Patch Changes

- feat: refactor AcGiContext into a class, fix SHAPE font resolution, and add STYLE table shape file support with draw-time database context handling
- Updated dependencies
  - @hy/common@1.6.6
  - @hy/geometry-engine@3.4.6

## 3.5.5

### Patch Changes

- feat: fix rendering and color resolution: resolve sub-entity RGB at draw time via AcGiContext and correctly compute ByBlock/ByLayer attribute colors from owning INSERT, improving consistency of block and entity display
- Updated dependencies
  - @hy/common@1.6.5
  - @hy/geometry-engine@3.4.5

## 3.5.4

### Patch Changes

- feat: upgrade libredwg-web to v0.7.4 to fix some issues on parsing dwg files
- Updated dependencies
  - @hy/common@1.6.4
  - @hy/geometry-engine@3.4.4

## 3.5.3

### Patch Changes

- feat: support proxy entity for dwg file
- Updated dependencies
  - @hy/common@1.6.3
  - @hy/geometry-engine@3.4.3

## 3.5.2

### Patch Changes

- feat: add AcDbProxyEntity with proxy graphic decoding
- Updated dependencies
  - @hy/common@1.6.2
  - @hy/geometry-engine@3.4.2

## 3.5.1

### Patch Changes

- fix(data-model): break circular deps via direct imports and add CJS bundle test (#106)
- Updated dependencies
  - @hy/common@1.6.1
  - @hy/geometry-engine@3.4.1

## 3.5.0

### Minor Changes

- feat: adds area support on curve, hatch, and geometry classes, extracts DXF conversion into the standalone @mlightcad/dxf-json-converter package, and documents GPL Web Worker isolation with example JSDoc

### Patch Changes

- Updated dependencies
  - @hy/common@1.6.0
  - @hy/geometry-engine@3.4.0

## 3.4.4

### Patch Changes

- feat: added drawNoPlotLayers policy for controlling no-plot layer visibility, fixed hatch pattern angle handling when explicit lines are defined, updated project license, and migrated npm publishing to Trusted Publishing via OIDC
- Updated dependencies
  - @hy/common@1.5.4
  - @hy/geometry-engine@3.3.4

## 3.4.3

### Patch Changes

- feat: geometricExtents for text, dimensions, table, and viewport; VPORT aspect ratio; case-insensitive VPORT lookup
- Updated dependencies
  - @hy/common@1.5.3
  - @hy/geometry-engine@3.3.3

## 3.4.2

### Patch Changes

- feat(data-model): add SHAPE entity support and honor DXF visibility in blocks
- Updated dependencies
  - @hy/common@1.5.2
  - @hy/geometry-engine@3.3.2

## 3.4.1

### Patch Changes

- feat: extend object snap support across entities and add ORTHOMODE, POLARMODE, POLARANG, and POLARADDANG system variables
- Updated dependencies
  - @hy/common@1.5.1
  - @hy/geometry-engine@3.3.1

## 3.4.0

### Minor Changes

- feat: replace WHITEBKCOLOR with MODELBKCOLOR and PAPERBKCOLOR

### Patch Changes

- Updated dependencies
  - @hy/common@1.5.0
  - @hy/geometry-engine@4.0.0

## 3.3.40

### Patch Changes

- fix: resolve text styles during progressive conversion and fix TRACE boundary order
- Updated dependencies
  - @hy/common@1.4.40
  - @hy/geometry-engine@3.2.40

## 3.3.39

### Patch Changes

- feat: add AcDbCurve::getOffsetCurves and centralize offset tolerance checks with AcGeTol
- Updated dependencies
  - @hy/common@1.4.39
  - @hy/geometry-engine@3.2.39

## 3.3.38

### Patch Changes

- fix: default layout manager factory survives production tree-shaking
- Updated dependencies
  - @hy/common@1.4.38
  - @hy/geometry-engine@3.2.38

## 3.3.37

### Patch Changes

- feat: improve tree-shaking with explicit ESM exports and add geometry snap helpers
- Updated dependencies
  - @hy/common@1.4.37
  - @hy/geometry-engine@3.2.37

## 3.3.36

### Patch Changes

- feat: add AcDbFormatter for AutoCAD-style length, point, and angle display
- Updated dependencies
  - @hy/common@1.4.36
  - @hy/geometry-engine@3.2.36

## 3.3.35

### Patch Changes

- feat: LUNITS/LUPREC/AUPREC, VPORT fallbacks, angbase/angdir; pnpm 10 + CI
- Updated dependencies
  - @hy/common@1.4.35
  - @hy/geometry-engine@3.2.35

## 3.3.34

### Patch Changes

- fix: build entity color via assignment to support AcDbHatch override
- Updated dependencies
  - @hy/common@1.4.34
  - @hy/geometry-engine@3.2.34

## 3.3.33

### Patch Changes

- fix: prefer anonymous table blocks when rendering AcDbTable
- Updated dependencies
  - @hy/common@1.4.33
  - @hy/geometry-engine@3.2.33

## 3.3.32

### Patch Changes

- feat: add SVG rendering support for hatch gradient previews and correct anchor for non-default TEXT/ATTRIB alignment
- Updated dependencies
  - @hy/common@1.4.32
  - @hy/geometry-engine@3.2.32

## 3.3.31

### Patch Changes

- feat: add hatch related system variables and fix SOLID hatch handling & preview rendering
- Updated dependencies
  - @hy/common@1.4.31
  - @hy/geometry-engine@3.2.31

## 3.3.30

### Patch Changes

- feat: add PAT parsing, predefined libraries, and SVG preview support
- Updated dependencies
  - @hy/common@1.4.30
  - @hy/geometry-engine@3.2.30

## 3.3.29

### Patch Changes

- feat: refine mline rendering
- Updated dependencies
  - @hy/common@1.4.29
  - @hy/geometry-engine@3.2.29

## 3.3.28

### Patch Changes

- feat: add mline and mleader supports
- Updated dependencies
  - @hy/common@1.4.28
  - @hy/geometry-engine@3.2.28

## 3.3.27

### Patch Changes

- fix: fix cad-viewer issue #243 and #183
- Updated dependencies
  - @hy/common@1.4.27
  - @hy/geometry-engine@3.2.27

## 3.3.26

### Patch Changes

- feat: add gradient hatch support
- Updated dependencies
  - @hy/common@1.4.26
  - @hy/geometry-engine@3.2.26

## 3.3.25

### Patch Changes

- feat: introduce explicit draw order and fix issues on closed wide LWPOLYLINE rendering and OCS arc/circle conversion
- Updated dependencies
  - @hy/common@1.4.25
  - @hy/geometry-engine@3.2.25

## 3.3.24

### Patch Changes

- fix: fix issues on dimension selection and snapping
- Updated dependencies
  - @hy/common@1.4.24
  - @hy/geometry-engine@3.2.24

## 3.3.23

### Patch Changes

- fix: fix block reference osnap resolution for transformed and nested entities and issue on color resolution for libredwg-converter
- Updated dependencies
  - @hy/common@1.4.23
  - @hy/geometry-engine@3.2.23

## 3.3.22

### Patch Changes

- feat: render wide LWPOLYLINE entities as filled geometry and add SVG linetype previews and demo rendering in example app
- Updated dependencies
  - @hy/common@1.4.22
  - @hy/geometry-engine@3.2.22

## 3.3.21

### Patch Changes

- feat: add CELTYPE support across database and DXF/DWG converters
- Updated dependencies
  - @hy/common@1.4.21
  - @hy/geometry-engine@3.2.21

## 3.3.20

### Patch Changes

- fix: fix issue #200 in cad-viewer
- Updated dependencies
  - @hy/common@1.4.20
  - @hy/geometry-engine@3.2.20

## 3.3.19

### Patch Changes

- feat: add clone method
- Updated dependencies
  - @hy/common@1.4.19
  - @hy/geometry-engine@3.2.19

## 3.3.18

### Patch Changes

- feat: improve text style fallback resolution and bump libredwg-web to 0.6.10
- Updated dependencies
  - @hy/common@1.4.18
  - @hy/geometry-engine@3.2.18

## 3.3.17

### Patch Changes

- feat: implement missing geometry/entity transforms and expand transform regression coverage
- Updated dependencies
  - @hy/common@1.4.17
  - @hy/geometry-engine@3.2.17

## 3.3.16

### Patch Changes

- feat(sysvars): add DYNMODE and DYNPROMPT system variables
- Updated dependencies
  - @hy/common@1.4.16
  - @hy/geometry-engine@3.2.16

## 3.3.15

### Patch Changes

- feat: improve geometry and optimize build configuration
- Updated dependencies
  - @hy/common@1.4.15
  - @hy/geometry-engine@3.2.15

## 3.3.14

### Patch Changes

- fix: improve DXF export functionality and refine AcDbSpline
- Updated dependencies
  - @hy/common@1.4.14
  - @hy/geometry-engine@3.2.14

## 3.3.13

### Patch Changes

- fix: fix #issue 150 in cad-viewer (#43)
- Updated dependencies
  - @hy/common@1.4.13
  - @hy/geometry-engine@3.2.13

## 3.3.12

### Patch Changes

- fix: upgrade dxf-json to fix bug #132 in cad-viewer repo
- Updated dependencies
  - @hy/common@1.4.12
  - @hy/geometry-engine@3.2.12

## 3.3.11

### Patch Changes

- fix issue on converting spline with fit points
- Updated dependencies
  - @hy/common@1.4.11
  - @hy/geometry-engine@3.2.11

## 3.3.10

### Patch Changes

- fix: fix bugs on building loops for hatch and revome dependency on verb-nurbs
- Updated dependencies
  - @hy/common@1.4.10
  - @hy/geometry-engine@3.2.10

## 3.3.9

### Patch Changes

- feat: improve DXF export
- Updated dependencies
  - @hy/common@1.4.9
  - @hy/geometry-engine@3.2.9

## 3.3.8

### Patch Changes

- fix: fix issue on reading dxf file caused by last release
- Updated dependencies
  - @hy/common@1.4.8
  - @hy/geometry-engine@3.2.8

## 3.3.7

### Patch Changes

- feat: add DXF export support
- Updated dependencies
  - @hy/common@1.4.7
  - @hy/geometry-engine@3.2.7

## 3.3.6

### Patch Changes

- feat: support changing foreground color
- Updated dependencies
  - @hy/common@1.4.6
  - @hy/geometry-engine@3.2.6

## 3.3.5

### Patch Changes

- chore: add system variables MEASUREMENTCOLOR, OSMODE, and TEXTCOLOR
- Updated dependencies
  - @hy/common@1.4.5
  - @hy/geometry-engine@3.2.5

## 3.3.4

### Patch Changes

- feat: add configurable parser worker timeout for drawing conversion and centralize database system variable names
- Updated dependencies
  - @hy/common@1.4.4
  - @hy/geometry-engine@3.2.4

## 3.3.3

### Patch Changes

- fix: fix issue 101
- Updated dependencies
  - @hy/common@1.4.3
  - @hy/geometry-engine@3.2.3

## 3.3.2

### Patch Changes

- feat(data-model): emit sysVarChanged only when sysvar value actually changes and add system variable 'LWDISPLAY'
- Updated dependencies
  - @hy/common@1.4.2
  - @hy/geometry-engine@3.2.2

## 3.3.1

### Patch Changes

- feat: set entity line weight and line type scale for newly created entity
- Updated dependencies
  - @hy/common@1.4.1
  - @hy/geometry-engine@3.2.1

## 3.3.0

### Patch Changes

- feat: support xdata and xrecord
- Updated dependencies
  - @hy/common@1.3.8
  - @hy/geometry-engine@3.1.11

## 3.2.7

### Patch Changes

- feat: respect value of system variables 'cecolor' and 'clayer' when creating one new entity
- Updated dependencies
  - @hy/common@1.3.7
  - @hy/geometry-engine@3.1.10

## 3.2.6

### Patch Changes

- feat: enhance polyline
- Updated dependencies
  - @hy/common@1.3.6
  - @hy/geometry-engine@3.1.9

## 3.2.5

### Patch Changes

- fix: fix issues 89 and 90 in cad-viewer repo
- Updated dependencies
  - @hy/common@1.3.5
  - @hy/geometry-engine@3.1.8

## 3.2.4

### Patch Changes

- feat: support ATTDEF ATTRIB entities when reading DXF file
- Updated dependencies
  - @hy/common@1.3.4
  - @hy/geometry-engine@3.1.7

## 3.2.3

### Patch Changes

- feat: support ATTDEF and ATTRIB entities
- Updated dependencies
  - @hy/common@1.3.3
  - @hy/geometry-engine@3.1.6

## 3.2.2

### Patch Changes

- Updated dependencies
  - @hy/common@1.3.2
  - @hy/geometry-engine@3.1.5

## 3.2.1

### Patch Changes

- feat: update file type handling to support custom converter types
- Updated dependencies
  - @hy/common@1.3.1
  - @hy/geometry-engine@3.1.4

## 3.2.0

### Minor Changes

- fix: fix regression bug on handling normal in insert and dimension entities resulted by commit d5a9966

## 3.1.4

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@3.1.3

## 3.1.3

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@3.1.2

## 3.1.2

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@3.1.1

## 3.1.1

### Patch Changes

- feat: refine class related to line weight

## 3.1.0

### Patch Changes

- feat: modify common, geometry-engine, and graphic-interface as dependencies of package data-model
- Updated dependencies
  - @hy/common@1.2.8
  - @hy/geometry-engine@3.0.10

## 3.0.12

### Patch Changes

- feat: fix transparency type in interface AcGiSubEntityTraits

## 3.0.11

### Patch Changes

- Updated dependencies
  - @hy/common@1.2.7
  - @hy/geometry-engine@3.0.9

## 3.0.10

### Patch Changes

- feat: support changing layer color
- Updated dependencies
  - @hy/common@1.2.6
  - @hy/geometry-engine@3.0.8

## 3.0.9

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@3.0.7

## 3.0.8

### Patch Changes

- feat: add basePoint for renderer and renderable entity

## 3.0.7

### Patch Changes

- feat: refine logic to convert POLYLINE entity in dxf/dwg
- Updated dependencies
  - @hy/geometry-engine@3.0.6

## 3.0.6

### Patch Changes

- fix: bump version again because the wrong package was published in npm registry
- Updated dependencies
  - @hy/geometry-engine@3.0.5

## 3.0.5

### Patch Changes

- feat: support interruptting the entire workflow if one task throw one exception
- Updated dependencies
  - @hy/geometry-engine@3.0.4

## 3.0.4

### Patch Changes

- @hy/geometry-engine@3.0.3

## 3.0.3

### Patch Changes

- fix: fix bug on parsing color
- Updated dependencies
  - @hy/geometry-engine@3.0.2

## 3.0.2

### Patch Changes

- feat: add one flag to delay creating one rendered entity in function AcDbEntity.draw

## 3.0.1

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@3.0.1

## 3.0.0

### Minor Changes

- fix: upgrade libredwg-web to fix bugs on getting layer name and line type name again

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@3.0.0

## 2.0.7

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@2.0.7

## 2.0.6

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@2.0.6

## 2.0.5

### Patch Changes

- @hy/geometry-engine@2.0.5

## 2.0.4

### Patch Changes

- feat: add 'FETCH_FILE' stage in AcDbDatabase.events.openProgress event
- Updated dependencies
  - @hy/geometry-engine@2.0.4

## 2.0.3

### Patch Changes

- refine methods to open database and refine typedocs of packages 'common' and 'data-model'
- Updated dependencies
  - @hy/geometry-engine@2.0.3

## 2.0.2

### Patch Changes

- add repo url in package.json
- Updated dependencies
  - @hy/geometry-engine@2.0.2

## 2.0.1

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@2.0.1

## 2.0.0

### Minor Changes

- refine constructor of spline related class to add one new parameter 'closed'

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@2.0.0

## 1.0.4

### Patch Changes

- Updated dependencies
  - @hy/geometry-engine@1.0.5

## 1.0.3

### Patch Changes

- bundle common, geometry-engine, and graphic-interface into data-model and remove dependency on lodash-es
- Updated dependencies
  - @hy/geometry-engine@1.0.3

## 1.0.2

### Patch Changes

- add readme for all of packages and remove dependencies on verb-nurbs-web
- Updated dependencies
  - @hy/geometry-engine@1.0.2
