# シュート軌道解析アプリ 実装計画 2026/11/26

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

（原本：claude.aiプロジェクト「BasketBall」の `claude/シュート軌道解析アプリ_実装計画_20261126.md`）

**Goal:** iPadのSafariだけで、1人シュートの軌道（入射角・通過位置など）をその場で測って声と画面で知らせ、1本ごとの数字と短い動画を保存し、数字をCSVで書き出せるWebアプリを作る。

**Architecture:** ビルドなしの静的サイト（HTML＋ESモジュール）。計算の部品は画面から切り離した純粋なモジュールにして、Nodeのテストで確かめる。同じ部品を、iPadのカメラ画面（index.html）とPCで練習動画を流す画面（analyze.html）の両方から使う。

**Tech Stack:** 素のJavaScript（ESモジュール）、Canvas 2D、getUserMedia、MediaRecorder、IndexedDB、Web Speech API、Web Share API。テストは `node --test`、IndexedDBのテストに `fake-indexeddb`（開発用だけ）。公開はGitHub Pages。

**Spec:** `docs/design.md`

## Global Constraints
- 動くのはiPadのSafari（ホーム画面に追加して使う）。Macは使わない
- ビルド工程なし。実行時に外部のサーバー・CDNへつながない（映像・データはiPadの外に出ない）
- 画面の文字はひらがな寄り。読み上げも日本語
- 長さの基準：リング内径 `RIM_INNER_M = 0.45`（m）。ボール直径 `BALL_DIAMETER_M = 0.22`（5号球）
- 座標の決まり：リング中心を原点、y は上が正（m）、x は打つ人のいる側が正（m）
- 測れなかったときは数字を出さず「はかれなかった」。平均に入れない
- 動画を消しても数字は残す
- テスト：`npm test`（= `node --test test/`）がすべて通ること

## Review Focus
1. ボールを拾いに行く人・ドリブルする人が画面を横切る → 1本と数えない（Task 5のテスト）
2. ボールがボードや画面の端に隠れて軌道が途切れる → 間違った角度を出さず「はかれなかった」（Task 3のテスト）
3. 打つ人がゴールの左側にいる（カメラの向きが逆） → 右側と同じ値が出る（Task 3のテスト）
4. 練習中に画面が消える・別のアプリに切り替わる → それまでの記録が残り、録画が止まる（Task 9の確認手順）
5. iPadの容量がいっぱいで動画が保存できない → 数字は保存され、動画だけ「ほぞんできなかった」（Task 7のテスト）

---

### Task 1: リポジトリと段階0の試作（性能を測る）

**Files:**
- Create: `package.json`（`"type":"module"`, `"scripts":{"test":"node --test test/"}`, devDependencies `fake-indexeddb`）, `.gitignore`, `README.md`, `docs/design.md`, `probe.html`, `js/probe.js`
- Test: `test/probe.test.js`

**Interfaces:**
- Produces: `summarizeProbe(raw) -> {fps720:number, fps1080:number, mime:string|null, concurrentRecorders:number, persist:boolean, idbBlobOk:boolean, jaVoice:boolean, verdict:'ok'|'ng', reasons:string[]}`

- [ ] **Step 1: 前橋さんに確認**：GitHubアカウント `vashimae50-code` に公開リポジトリ `shot-arc` を作って push してよいか。返事があるまで push しない
- [ ] **Step 2: Write the failing test** `test/probe.test.js`
  - `summarizeProbe({fps720:29.6, ..., concurrentRecorders:3, persist:true, idbBlobOk:true, jaVoice:true, mime:'video/mp4'})` → `verdict:'ok'`
  - `fps720:14` → `verdict:'ng'`、`reasons` に `'コマ数が少ない'`
  - `concurrentRecorders:1` → `verdict:'ok'` で `reasons` に `'録画は1本ずつ'`
  - `mime:null` → `verdict:'ng'`
- [ ] **Step 3: Run** `npm test` → FAIL（`summarizeProbe` が無い）
- [ ] **Step 4: `summarizeProbe` と `probe.html` を作る**。合格の線：fps720 ≥ 24、mime あり、idbBlobOk。probe.html は次を測って画面にJSONで出し、「コピー」ボタンを付ける
  - getUserMedia（背面カメラ、1280×720 と 1920×1080、frameRate 60 を要求）→ `requestVideoFrameCallback` で5秒数えて実際のfps
  - `MediaRecorder.isTypeSupported` で `video/mp4;codecs=avc1`, `video/mp4`, `video/webm` の順に最初に通るもの
  - Canvasの `captureStream(30)` に MediaRecorder を3本同時に9秒かけ、全部が0バイトより大きく `<video>` で再生できるか → 同時に動いた本数
  - `navigator.storage.persist()` の結果、`navigator.storage.estimate()`
  - IndexedDBに5MBのBlobを入れて読み戻せるか
  - `speechSynthesis.getVoices()` に `ja` があるか、「よんじゅうさんど、てまえ」を1回読む
- [ ] **Step 5: Run** `npm test` → PASS
- [ ] **Step 6: Commit** `feat: probe page and repo skeleton`。GitHub Pages を有効にする
- [ ] **Step 7: 前橋さんに依頼**：iPadのSafariで `…/probe.html` を開き、ホーム画面に追加し、そこから開いて結果をコピーしてチャットに貼ってもらう
- [ ] **Step 8: 判定**：`verdict:'ng'` なら、ここで止めて結果と次の案を前橋さんに報告する。`concurrentRecorders` の値をTask 8に書き込む

### Task 2: 座標変換（geom.js）

**Files:** Create `js/geom.js` / Test `test/geom.test.js`

**Interfaces:**
- Produces:
  - `makeCalib({rimX0, rimX1, rimY, shooterSide}) -> Calib`。`Calib = {rimX0, rimX1, rimY, rimWpx, mPerPx, cx, sign, netBottomY, ballRpx}`。`shooterSide` は `'left'|'right'`
  - `toWorld(calib, {x, y}) -> {x, y}`（m）、`toPixel(calib, {x, y}) -> {x, y}`（画素）

- [ ] **Step 1: Write the failing test**
  - `makeCalib({rimX0:555, rimX1:645, rimY:300, shooterSide:'right'})` → `rimWpx 90`, `mPerPx 0.005`, `cx 600`, `netBottomY 381`（rimY＋0.9×rimWpx）, `ballRpx` ≈ 22.0
  - `toWorld(calib,{x:1200,y:480})` → `{x:3.0, y:-0.9}`
  - `shooterSide:'left'` のとき `toWorld(calib,{x:0,y:480})` → `{x:3.0, y:-0.9}`
  - `toPixel(toWorld(p)) ≈ p`
- [ ] **Step 2: Run** `node --test test/geom.test.js` → FAIL
- [ ] **Step 3: 実装**：`mPerPx = RIM_INNER_M / rimWpx`、`sign = shooterSide==='right' ? 1 : -1`、`x = sign*(px.x-cx)*mPerPx`、`y = -(px.y-rimY)*mPerPx`。定数 `RIM_INNER_M`, `BALL_DIAMETER_M` もここから export
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: calibration and coordinate transform`

### Task 3: 放物線の当てはめと測定値（trajectory.js）

**Files:** Create `js/trajectory.js` / Test `test/trajectory.test.js`

**Interfaces:**
- Consumes: `makeCalib`, `toWorld`（Task 2）
- Produces: `measureShot(calib, points) -> Metrics`。`points = [{t:秒, x:画素, y:画素}]`
  - `Metrics = {quality:'ok'|'unmeasured', reason?:string, entryAngleDeg, releaseAngleDeg, apexM, depthCm, depthLabel:'てまえ'|'まんなか'|'おく', distanceM, flightS, nPoints, crossT, fit:{x0,vx,y0,vy,ay}}`（unmeasured のときは数値の項目は `null`）

- [ ] **Step 1: Write the failing test**。テスト用の軌道：打つ位置 (x=3.0, y=-0.9) m、vx=-3.0、vy=5.8 m/s、g=9.8、t=0〜1.0秒を30fpsで31点。Task 2のcalib（rimX0 555, rimX1 645, rimY 300, right）で画素に直して渡す
  - `entryAngleDeg` 53.1±0.5、`releaseAngleDeg` 62.6±0.5、`apexM` 0.82±0.03、`depthCm` 22.5±1.0、`depthLabel 'まんなか'`、`distanceM` 3.0±0.05、`flightS` 1.0±0.04、`quality 'ok'`
  - 同じ軌道を左右反転、`shooterSide:'left'` → 同じ値（Review Focus 3）
  - リングより上で途切れる（t≤0.55 の点だけ）→ `quality 'unmeasured'`, `reason 'リングの高さまでとどかない'`（Review Focus 2）
  - 点が5個だけ → `'unmeasured'`, `reason 'てんがすくない'`
  - 各点に±0.6×ballRpx を超えるでたらめなずれ → `'unmeasured'`, `reason 'ずれがおおきい'`
  - vx を変えて x の通過位置が 0.20 m → `'てまえ'`。-0.15 m → `'おく'`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: 実装**。最小二乗で x(t)=x0+vx·t（1次）、y(t)=y0+vy·t+ay·t²（2次。重力の値は決め打ちせず当てはめる）
  - 使う点：最初の点から、yが下向きに0を初めて横切る直前まで＋横切った後の1点
  - `crossT`：y(t)=0 の大きい方の解。`entryAngleDeg = atan(|y'(crossT)| / |vx|)`、`releaseAngleDeg = atan(y'(t0)/|vx|)`
  - `apexM = max y(t)`、`depthCm = (0.225 - x(crossT))*100`、ラベル：15未満てまえ・15〜30まんなか・30超おく
  - `distanceM = x(t0)`、`flightS = crossT - t0`
  - unmeasured の条件：使える点が8未満／crossT が無い／当てはめの残差の二乗平均が 0.6×ballRpx を超える
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: trajectory fit and shot metrics`

### Task 4: 入った／外れた（outcome.js）

**Files:** Create `js/outcome.js` / Test `test/outcome.test.js`

**Interfaces:**
- Consumes: `Calib`（Task 2）、`Metrics`（Task 3）
- Produces: `judgeOutcome(calib, points, metrics) -> 'make'|'miss'|'unknown'`

- [ ] **Step 1: Write the failing test**（Task 3と同じ calib・軌道を使う）
  - 中心を通り、リングの高さの後もリングの内側を下がって、netBottomY より下まで点がある → `'make'`
  - 手前の縁より外（x=0.30）でリングの高さを横切り、その後また上がる → `'miss'`
  - リングの高さを横切る前に点が終わる → `'unknown'`
  - リングの内側を通るが、その後0.5秒以内にリングより上に戻る（はね出し）→ `'miss'`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: 実装**：リングの高さを下向きに横切ったときの x が内側、かつその後0.5秒以内に「netBottomY まで下がる」「リングより上に戻らない」の両方 → make。横切った後の点が無い → unknown。それ以外 → miss
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: make/miss judgement`

### Task 5: ボール検出と1本の区切り（ballDetect.js, segmenter.js）

**Files:** Create `js/ballDetect.js`, `js/segmenter.js` / Test `test/ballDetect.test.js`, `test/segmenter.test.js`

**Interfaces:**
- Consumes: `Calib`（Task 2）
- Produces:
  - `detectBall(cur:ImageDataLike, prev:ImageDataLike|null, calib, roi:{x,y,w,h}) -> [{x,y,area,score}]`
  - `detectRim(img:ImageDataLike) -> {rimX0, rimX1, rimY}|null`
  - `class ShotSegmenter { constructor(calib); push(t:number, dets:Det[]) -> ShotTrack[] }`。`ShotTrack = {points:[{t,x,y}], startT, endT}`

- [ ] **Step 1: Write the failing tests**
  - detectBall：320×180、空色 (135,190,235) の背景に、オレンジ (230,110,40) の半径11の円。前のコマは円が20画素左 → 候補1つ、中心の誤差1.5画素以内
  - 円が動いていない → 0個
  - 面積3画素のオレンジの点 → 0個
  - detectRim：幅45・高さ4のオレンジの横棒 → 左右の端と高さを±2画素で返す。横棒が無い → `null`
  - segmenter：Task 3の軌道（画素）を1コマずつ push → 1本、点の数28以上
  - 同じ軌道を2回（間に1秒何もない）→ 2本
  - リングより低い所を横に動くだけの検出 → 0本（Review Focus 1）
  - 軌道の途中に、遠く離れた1点の誤検出が混じる → 1本のまま、その点は入らない
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: 実装**
  - detectBall：roi の中で、色がオレンジ（色相6〜32度、彩度0.51以上、明るさ0.43以上）かつ前のコマとの明るさの差が25以上の画素を集め、つながった塊ごとに面積を出す。期待面積 π×ballRpx² の0.3〜3.0倍だけ残す
  - detectRim：オレンジ〜赤の画素の塊で、横幅÷高さが4以上、画面の上半分にあるもののうち一番横に長いもの
  - segmenter：1コマ前の点から 1.2×rimWpx 以内で一番近い候補をつなぐ。0.4秒つながらない、または netBottomY＋0.5×rimWpx より下に出たら1本を閉じる。「6点以上」かつ「どこかで rimY − 1.0×rimWpx より上に出た」ものだけを返す
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: ball detection, rim detection, shot segmentation`

### Task 6: 共通の流れとPCでの練習動画テスト（pipeline.js, analyze.html）

**Files:** Create `js/pipeline.js`, `analyze.html`, `js/analyze.js` / Test `test/pipeline.test.js`

**Interfaces:**
- Consumes: Task 2〜5 の全部
- Produces: `class Pipeline { constructor(calib, {procWidth:320}); processFrame(t:number, img:ImageDataLike) -> ShotResult[] }`。`ShotResult = {track, metrics, outcome}`

- [ ] **Step 1: Write the failing test**：Task 3の軌道の位置にオレンジの円を描いた合成コマ（320×180、30fps、前後0.5秒は空だけ）を順に流す → ShotResult が1件、`entryAngleDeg` 53.1±1.5、`outcome 'make'`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: 実装**：processFrame は detectBall → segmenter.push → 閉じた1本ごとに measureShot と judgeOutcome
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: analyze.html を作る**：動画ファイルを選ぶ → リングの左右の端をクリックして calib → 1コマずつ処理 → 1本ごとの表と軌道を重ねた画面、CSVの保存ボタン
- [ ] **Step 6: 練習動画の準備**：ノートPCの練習動画フォルダをつなぐ。`虎旺シュート集_20261118.mp4` を 1280×720・H.264・30fps に変換する
- [ ] **Step 7: 合格の確認**：拾った本数が147本以上（163本の9割）。手作業で判定できた158本のうち、入った外れたが合うのが9割以上
- [ ] **Step 8: 結果を前橋さんに報告**
- [ ] **Step 9: Commit** `feat: shared pipeline and offline video analyzer`

### Task 7: 保存とCSV（store.js, csv.js）

**Files:** Create `js/store.js`, `js/csv.js` / Test `test/store.test.js`, `test/csv.test.js`

**Interfaces:**
- Produces（store.js、DB名 `shotarc`、版1、ストア `sessions` `shots` `clips`）:
  - `openStore(indexedDB=globalThis.indexedDB) -> Store`
  - `Store.addSession({player, calib}) -> sessionId`、`Store.endSession(id)`
  - `Store.saveShot(shot, clipBlob|null, clipMeta|null) -> {shotId, clipSaved:boolean}`
  - `Store.listSessions() -> Session[]`、`Store.listShots({sessionId?, from?, to?}) -> Shot[]`
  - `Store.updateOutcome(shotId, outcome)`
  - `Store.deleteClip(shotId)`、`Store.deleteSessionClips(sessionId)`、`Store.deleteExportedClips()`
  - `Store.markExported(shotIds)`、`Store.getClip(shotId) -> {blob, mime, offsetS, durationS}|null`
- Produces（csv.js）: `toCsv(shots) -> string`、`needsExportWarning(shots, now:Date) -> boolean`

- [ ] **Step 1: Write the failing tests**（`fake-indexeddb` を渡す）
  - 保存した1本を `deleteClip` → `getClip` は null、`listShots` にはその1本が数字つきで残る
  - `deleteExportedClips` は `exported:true` の動画だけ消す
  - clips への書き込みが `QuotaExceededError` で失敗する → `{clipSaved:false}`、shot は保存されている（Review Focus 5）
  - `updateOutcome` → `outcome` が変わり `outcomeEdited:true`
  - toCsv：先頭にBOM。1行目 `日時,打った人,回,何本目,結果,結果を手で直した,入射角,リリース角,最高点m,通過位置cm,通過位置,距離m,飛んだ時間s,拾えたコマ,測定,動画`
  - 結果は `はいった`／`はずれ`／`ふめい`、角度は小数1桁、m は小数2桁、unmeasured の数値は空欄、測定は `ok`／`はかれなかった`、動画は `あり`／`なし`。カンマを含む値は `"` で囲む
  - needsExportWarning：書き出していない本数が100以上 → true。一番古い書き出していない記録が7日より前 → true。それ以外 → false
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: IndexedDB store and CSV export`

### Task 8: 1本ごとの動画（recorder.js）

**Files:** Create `js/recorder.js` / Test `test/recorder.test.js`

**Interfaces:**
- Produces:
  - `planSegments(nowS, {stepS:3, lenS:9}) -> {startS, endS}[]`
  - `chooseSegment(segments, tStart, tEnd) -> {startS, endS}|null`
  - `class ClipRecorder { constructor(canvas, mime); start(); clipFor(tStart, tEnd) -> Promise<{blob, mime, offsetS, durationS}|null>; stop() }`

- [ ] **Step 1: Write the failing test**
  - stepS 3・lenS 9 の区切りで、tStart=10.2・tEnd=15.0 → 始まり9の区切り、offset 1.2
  - tEnd − tStart が 6.5 → `null`
  - 区切りが無い時刻 → `null`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: 実装**：Canvas の `captureStream(30)` に MediaRecorder を stepS ごとに始め、lenS で止める。同時に動いた本数が3未満なら stepS 6・lenS 9
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: staggered clip recorder`

### Task 9: iPadの撮影画面（index.html, app.js）

**Files:** Create `index.html`, `css/app.css`, `js/app.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`

- [ ] **Step 1: 打つ人選び**：`とらお` `わかな` `さこ` ＋「ついか」。最後に選んだ人を覚える
- [ ] **Step 2: 位置合わせ**：`detectRim` の結果を枠で表示 →「OK」か、リングの左端・右端をタップ。打つ人の左右を選ぶ
- [ ] **Step 3: 撮影中**：毎コマ Canvas に映像を描き、320幅に縮小して `Pipeline.processFrame`。直前の軌道、数値、今日の集計を出す
- [ ] **Step 4: 読み上げ**：「{入射角の整数}ど、{てまえ|まんなか|おく}」。unmeasured は「はかれなかった」
- [ ] **Step 5: 保存**：`ClipRecorder.clipFor` → `Store.saveShot`。clipSaved が false なら「どうがは ほぞんできなかった」
- [ ] **Step 6: 終わり**：「おわり」で `endSession`、録画を止め、まとめを出す。`visibilitychange` で同じ処理。最初に `navigator.storage.persist()`
- [ ] **Step 7: 確認（前橋さんと）**：自宅前のゴールで20本
- [ ] **Step 8: Commit** `feat: live shooting screen`

### Task 10: 記録一覧・手直し・書き出し・削除

**Files:** Modify `index.html`, `js/app.js`, `css/app.css`

- [ ] **Step 1: 一覧**：日付→回→1本。動画を `offsetS` から再生（0.25倍・0.5倍・1倍、コマ送り）
- [ ] **Step 2: 手直し**：○×をタップで切り替え → `updateOutcome`
- [ ] **Step 3: 書き出し**：全期間／期間 → `toCsv` → `navigator.share({files})`（だめならダウンロード）。`markExported`。ファイル名 `shot-arc_YYYYMMDD.csv`（日本時間）。動画も1本ずつ・回ごとに書き出せる
- [ ] **Step 4: 削除**：1本／回／「かきだしずみの どうがを ぜんぶけす」。確認「どうがだけ けします。すうじは のこります」
- [ ] **Step 5: 書き出し忘れ**：`needsExportWarning` が true なら帯を出す
- [ ] **Step 6: 確認**：CSVをExcelで開ける。動画を全部消しても数字が残る
- [ ] **Step 7: Commit** `feat: records, edit, export and delete`

### Task 11: 仕上げ

**Files:** Modify `README.md`

- [ ] **Step 1: README に使い方**
- [ ] **Step 2: `npm test` 全部 PASS を確認**
- [ ] **Step 3: 設計書の【推論】【仮説】を結果で書き換えた版をプロジェクトに `_rev1` で保存**
- [ ] **Step 4: Commit** `docs: usage` と push
