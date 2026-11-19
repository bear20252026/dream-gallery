# ctx 属性域登记册(I1 自动生成,勿手改)

> 生成:`node scripts/admin/ctx-registry.cjs --write`;校验:`--check`(vitest 守卫 ctx-registry.test.js 同跑)。
> 新属性/新写方/写方变更必须重新生成登记册并在 PR 里说明——这是 ctx 按域真拆前的所有权制度地基。
> ⚠️ 标记 = 多写方(真拆时须先收编单一 owner)。注释行/解构读不计;动态键 ctx[k] 全仓必须保持 0。

**总计 176 个属性,4 个多写方。**

## _root(21)

| 属性 | 写方 | |
|---|---|---|
| `ctx._jumpHold` | `src/scene/player.js` |  |
| `ctx.ent` | `src/ctx.js` |  |
| `ctx.events` | `src/ctx.js` |  |
| `ctx.fillStyle` | `src/gallery/markers.js` |  |
| `ctx.font` | `src/gallery/markers.js` |  |
| `ctx.gallery` | `src/ctx.js` |  |
| `ctx.input` | `src/ctx.js` |  |
| `ctx.kunlun` | `src/ctx.js` |  |
| `ctx.lineWidth` | `src/gallery/markers.js` |  |
| `ctx.loop` | `src/ctx.js` |  |
| `ctx.media` | `src/ctx.js` |  |
| `ctx.mode` | `src/ctx.js` |  |
| `ctx.onTick` | `src/ctx.js`<br>`src/hot.js` | ⚠️多写方 |
| `ctx.oncomplete` | `src/visitor-fp.js` |  |
| `ctx.player` | `src/ctx.js` |  |
| `ctx.scene` | `src/ctx.js` |  |
| `ctx.strokeStyle` | `src/gallery/markers.js` |  |
| `ctx.textAlign` | `src/gallery/markers.js` |  |
| `ctx.textBaseline` | `src/gallery/markers.js` |  |
| `ctx.tickers` | `src/ctx.js` |  |
| `ctx.ui` | `src/ctx.js` |  |

## gallery(8)

| 属性 | 写方 | |
|---|---|---|
| `ctx.gallery.hangOne` | `src/gallery/paintings.js` |  |
| `ctx.gallery.houseMats` | `src/scene/scene.js` |  |
| `ctx.gallery.onC3D` | `src/gallery/paintings.js` |  |
| `ctx.gallery.openHouseColor` | `src/gate/housecolor.js` |  |
| `ctx.gallery.paintGroups` | `src/gallery/paintings.js` |  |
| `ctx.gallery.wallSpecs` | `src/scene/scene.js` |  |
| `ctx.gallery.zG` | `src/gallery/painting-zoom.js` |  |
| `ctx.gallery.zoomIn` | `src/gallery/paintings.js` |  |

## kunlun(28)

| 属性 | 写方 | |
|---|---|---|
| `ctx.kunlun.arkTeleportToPeak` | `src/kunlun/ark.js` |  |
| `ctx.kunlun.checkSkyMs` | `src/gate/settings/sky-progress.js` |  |
| `ctx.kunlun.eternalClick` | `src/kunlun/eternal.js` |  |
| `ctx.kunlun.eternalHandlers` | `src/kunlun/eternal-handlers.js` |  |
| `ctx.kunlun.eternalKeepOut` | `src/kunlun/eternal.js` |  |
| `ctx.kunlun.eternalTeleport` | `src/kunlun/eternal.js` |  |
| `ctx.kunlun.eternalWelcome` | `src/kunlun/eternal.js` |  |
| `ctx.kunlun.fadeTeleport` | `src/scene/player.js` |  |
| `ctx.kunlun.flyAudio` | `src/kunlun/peaks.js` |  |
| `ctx.kunlun.groundOverride` | `src/shared/ground-resolver.js` |  |
| `ctx.kunlun.hidePlanetMote` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.hideSproutMote` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.isDone` | `src/kunlun/spirits.js` |  |
| `ctx.kunlun.isStarGateOut` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.letgoRecall` | `src/kunlun/letgo.js` |  |
| `ctx.kunlun.peakVidEl` | `src/kunlun/peaks.js` |  |
| `ctx.kunlun.planetsMark` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.planetsMode` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.rebuildEternalPicks` | `src/kunlun/eternal.js` |  |
| `ctx.kunlun.revealStarGate` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.setChapter` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.spiritMark` | `src/kunlun/spirits.js` |  |
| `ctx.kunlun.spiritsCollectExternal` | `src/kunlun/spirits.js` |  |
| `ctx.kunlun.spiritsDecorate` | `src/kunlun/planets.js` |  |
| `ctx.kunlun.spiritsGot` | `src/kunlun/spirits.js` |  |
| `ctx.kunlun.spiritsNextKey` | `src/kunlun/spirits.js` |  |
| `ctx.kunlun.spiritsState` | `src/kunlun/spirits.js` |  |
| `ctx.kunlun.spiritsTTS` | `src/kunlun/spirits.js` |  |

## loop(1)

| 属性 | 写方 | |
|---|---|---|
| `ctx.loop.timeScale` | `src/loop-manager.js` |  |

## media(16)

| 属性 | 写方 | |
|---|---|---|
| `ctx.media.audioManager` | `src/scene/media/audio-manager.js` |  |
| `ctx.media.bigScreenHold` | `src/kunlun/peaks.js` |  |
| `ctx.media.dayHour` | `src/loop-manager.js` |  |
| `ctx.media.dayTimeSource` | `src/scene/time-shift.js` |  |
| `ctx.media.desert` | `src/scene/desert.js` |  |
| `ctx.media.drawMusicCanvas` | `src/scene/media/music-canvas.js` |  |
| `ctx.media.guideMesh` | `src/gallery/signs.js` |  |
| `ctx.media.mA` | `src/scene/media/audio-manager.js` |  |
| `ctx.media.mpMesh` | `src/gallery/signs.js` |  |
| `ctx.media.playGalleryAudio` | `src/scene/media/gallery-audio.js` |  |
| `ctx.media.scrollLink` | `src/gallery/links.js` |  |
| `ctx.media.signMesh` | `src/gallery/signs.js` |  |
| `ctx.media.startVidSeq` | `src/scene/media/video-wall.js` |  |
| `ctx.media.v45Tex` | `src/scene/media/video-wall.js` |  |
| `ctx.media.vidEl` | `src/scene/media/video-wall.js` |  |
| `ctx.media.vidMesh` | `src/scene/media/video-wall.js` |  |

## mode(13)

| 属性 | 写方 | |
|---|---|---|
| `ctx.mode.LINK_MODEL_TYPES` | `src/gallery/mode.js` |  |
| `ctx.mode.MOUNTABLE_ICONS` | `src/gallery/mode.js` |  |
| `ctx.mode.applyMode` | `src/gallery/mode.js` |  |
| `ctx.mode.applyPaintMode` | `src/gallery/mode.js` |  |
| `ctx.mode.applyTexGate` | `src/gallery/mode.js` |  |
| `ctx.mode.linkGuard` | `src/gallery/mode.js` |  |
| `ctx.mode.myUploadTokens` | `src/gate/upload.js` |  |
| `ctx.mode.openUpload` | `src/gate/upload.js` |  |
| `ctx.mode.refreshMode` | `src/gallery/mode.js` |  |
| `ctx.mode.renderCustomLinks` | `src/gallery/mode.js` |  |
| `ctx.mode.spawnLinkModel` | `src/gallery/mode.js` |  |
| `ctx.mode.texAllowed` | `src/gallery/mode.js` |  |
| `ctx.mode.trackClick` | `src/gallery/mode.js` |  |

## player(9)

| 属性 | 写方 | |
|---|---|---|
| `ctx.player.drawMap` | `src/scene/player.js` |  |
| `ctx.player.ks` | `src/scene/player.js` |  |
| `ctx.player.orbit` | `src/scene/player.js` |  |
| `ctx.player.pl` | `src/scene/player.js` |  |
| `ctx.player.playerSM` | `src/scene/player.js` |  |
| `ctx.player.quizPassScore` | `src/gate/quizgate.js` |  |
| `ctx.player.quizPassed` | `src/scene/player.js` |  |
| `ctx.player.tickAvatarGait` | `src/scene/player.js` |  |
| `ctx.player.viewMode` | `src/scene/player.js` |  |

## scene(60)

| 属性 | 写方 | |
|---|---|---|
| `ctx.scene.IL` | `src/scene/scene.js` |  |
| `ctx.scene.IR` | `src/scene/scene.js` |  |
| `ctx.scene.IRB` | `src/scene/scene.js` |  |
| `ctx.scene.IRT` | `src/scene/scene.js` |  |
| `ctx.scene.L` | `src/scene/scene.js` |  |
| `ctx.scene.OBE` | `src/scene/scene.js` |  |
| `ctx.scene.OBR` | `src/scene/scene.js` |  |
| `ctx.scene.OL` | `src/scene/scene.js` |  |
| `ctx.scene.OR` | `src/scene/scene.js` |  |
| `ctx.scene.OT` | `src/scene/scene.js` |  |
| `ctx.scene.WH` | `src/scene/scene.js` |  |
| `ctx.scene.aB` | `src/scene/scene.js` |  |
| `ctx.scene.activeWorld` | `src/core/scene-manager.js` |  |
| `ctx.scene.addBounds` | `src/scene/scene.js` |  |
| `ctx.scene.ambL` | `src/scene/scene.js` |  |
| `ctx.scene.avatar` | `src/kunlun/avatar.js`<br>`src/scene/player.js` | ⚠️多写方 |
| `ctx.scene.bD` | `src/scene/scene.js` |  |
| `ctx.scene.bW` | `src/scene/scene.js` |  |
| `ctx.scene.bounds` | `src/scene/scene.js` |  |
| `ctx.scene.cam` | `src/scene/scene.js` |  |
| `ctx.scene.earthDayApi` | `src/kunlun/earth-day.js` |  |
| `ctx.scene.endingApi` | `src/kunlun/ending-journey.js` |  |
| `ctx.scene.enterWorld` | `src/core/scene-manager.js` |  |
| `ctx.scene.floorD` | `src/scene/scene.js` |  |
| `ctx.scene.floorW` | `src/scene/scene.js` |  |
| `ctx.scene.foxApi` | `src/kunlun/scene10-fox.js` |  |
| `ctx.scene.getActiveBounds` | `src/core/scene-manager.js` |  |
| `ctx.scene.getActiveGround` | `src/core/scene-manager.js` |  |
| `ctx.scene.getActiveRoot` | `src/core/scene-manager.js` |  |
| `ctx.scene.groundUniforms` | `src/scene/scene.js` |  |
| `ctx.scene.hemiL` | `src/scene/scene.js` |  |
| `ctx.scene.iG` | `src/scene/scene.js` |  |
| `ctx.scene.jB` | `src/scene/scene.js` |  |
| `ctx.scene.jT` | `src/scene/scene.js` |  |
| `ctx.scene.kintsugiOn` | `src/scene/scene.js` |  |
| `ctx.scene.layout` | `src/scene/scene.js` |  |
| `ctx.scene.leaveWorld` | `src/core/scene-manager.js` |  |
| `ctx.scene.loadTexCapped` | `src/scene/scene.js` |  |
| `ctx.scene.loopManager` | `src/main.js` |  |
| `ctx.scene.mP2` | `src/scene/scene.js` |  |
| `ctx.scene.planeApi` | `src/scene/plane-flight.js` |  |
| `ctx.scene.pls` | `src/scene/scene.js` |  |
| `ctx.scene.pyrHeight` | `src/scene/scene.js` |  |
| `ctx.scene.ray` | `src/scene/scene.js` |  |
| `ctx.scene.removeBounds` | `src/scene/scene.js` |  |
| `ctx.scene.renderPostProcessing` | `src/core/scene-manager.js` |  |
| `ctx.scene.resizePostProcessing` | `src/main.js` |  |
| `ctx.scene.rnd` | `src/scene/scene.js` |  |
| `ctx.scene.s` | `src/core/scene-manager.js`<br>`src/scene/scene.js` | ⚠️多写方 |
| `ctx.scene.setAtmosphere` | `src/main.js` |  |
| `ctx.scene.setLowQuality` | `src/main.js` |  |
| `ctx.scene.setTime` | `src/scene/scene.js` |  |
| `ctx.scene.skyUniforms` | `src/scene/scene.js` |  |
| `ctx.scene.startWorld` | `src/main.js` |  |
| `ctx.scene.syncPostProcessingPixelRatio` | `src/main.js` |  |
| `ctx.scene.tL` | `src/scene/scene.js` |  |
| `ctx.scene.toMainWorld` | `src/core/scene-manager.js` |  |
| `ctx.scene.worldChanged` | `src/core/scene-manager.js` |  |
| `ctx.scene.worldManager` | `src/core/scene-manager.js` |  |
| `ctx.scene.worldStack` | `src/core/scene-manager.js` |  |

## ui(20)

| 属性 | 写方 | |
|---|---|---|
| `ctx.ui.advanceDialog` | `src/core/gameshell-system.js` |  |
| `ctx.ui.announceAchievements` | `src/gate/settings.js` |  |
| `ctx.ui.cancelDialogScope` | `src/core/gameshell-system.js` |  |
| `ctx.ui.chapterMap` | `src/ui/chapter-map.js` |  |
| `ctx.ui.dialogOpen` | `src/core/gameshell-system.js` |  |
| `ctx.ui.gentleTest` | `src/gate/quiz.js` |  |
| `ctx.ui.journey` | `src/core/journey-system.js` |  |
| `ctx.ui.kunlunSpeak` | `src/core/gameshell-system.js`<br>`src/scene/media/audio-manager.js` | ⚠️多写方 |
| `ctx.ui.modeToast` | `src/gallery/mode.js` |  |
| `ctx.ui.openDialog` | `src/core/gameshell-system.js` |  |
| `ctx.ui.overlay` | `src/ui/overlay.js` |  |
| `ctx.ui.portfolio` | `src/ui/portfolio.js` |  |
| `ctx.ui.showGuideCard` | `src/main.js` |  |
| `ctx.ui.starMap` | `src/ui/star-map.js` |  |
| `ctx.ui.store` | `src/state/store.js` |  |
| `ctx.ui.storyMusic` | `src/ui/story-music.js` |  |
| `ctx.ui.storyTarget` | `src/main.js` |  |
| `ctx.ui.voyage` | `src/ui/voyage.js` |  |
| `ctx.ui.voyageScenes` | `src/ui/voyage-scenes.js` |  |
| `ctx.ui.witness` | `src/ui/witness-card.js` |  |

