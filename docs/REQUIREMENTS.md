# RexelComposer 要件定義書 v1

2026-11-18

## 概要と背景

RexelComposer は、ノードベースの画像処理ツール [Pixel Composer](https://github.com/Ttanasart-pt/Pixel-Composer) を Web 技術で再構成し、Web・VSCode拡張・CLI の3つの窓から同じロジックで使えるようにするプロジェクト。

本家の残念な点と、RexelComposer での解決策:

| 本家の課題 | なぜ問題か | RexelComposer の解決策 |
| --- | --- | --- |
| GameMaker 依存 | 時が経つとライセンス料でコード資産を人質に取られる | TypeScript + Web 標準のみ。ベンダーロックなし |
| Steam Workshop での共有 | DLしづらく不安定。プロ向けツールと相性が悪い | プロジェクトファイル(.rxc / .rxcp)の添付で共有完結 |
| Lua プラグイン | スケーラブルでない | TypeScript/JavaScript プラグイン。型定義つきAPIを提供 |

## 決定事項

全ロジックを TypeScript で一つにし、3つの窓はそれを読み込むだけにする。当初の「CLIは Rust」は、ロジック二重化を避けるため取り下げた。

| 項目 | 決定 |
| --- | --- |
| コア言語 | TypeScript(Web・VSCode・CLI 共通) |
| 設計パターン | MVVM(Model = core / ViewModel = TS / View = React) |
| 画像処理 | CPU のみ(Web Worker / worker_threads で並列化)。GPU は使わない |
| 色の扱い | 計算は sRGB のまま、内部は Float32 RGBA、書き出しは 8bit PNG |
| 画像の読込 | PNG のみ。ブラウザのデコーダに任せず core でデコードし、全ホストで同じ画素にする。インターレース PNG は非対応 |
| Web・VSCode の UI | React + Tailwind CSS + TypeScript。色は VSCode のテーマトークンに合わせる |
| CLI | TypeScript(Node.js 22.13 以上) |
| .rxc とパラメータの検証 | zod v4。型・検証・JSON Schema(`rexel schema`)を一つの定義から出す |
| TypeScript の版 | 6.0 系に固定。typescript-eslint 8 系が 6.1 未満までしか対応していないため。対応したら上げる |
| プラグイン | TypeScript / JavaScript |
| AI 対応 | Agent Skill をリポジトリに同梱 |
| v1 スコープ | 静止画のノード処理 |
| 本家 .pxc 互換 | 対象外 |
| 共有方法 | プロジェクトファイルの添付のみ(.rxc / .rxcp) |
| リポジトリ名 | Rexel-Composer |
| Web の配信 | GitHub Pages + PWA(オフライン対応) |
| ライセンス | MIT |
| テストコード | 書かない |

## アーキテクチャ

ロジックは `core` にだけ置き、3つの窓(ホスト)は「ファイルをどう読むか・重い処理をどこで回すか・画面をどう出すか」の差分だけを実装する。core は DOM も Node API も触らず、必要なものはインターフェースとしてホストから注入する(依存性逆転)。

```
@rexel/host-web      @rexel/host-vscode    rexel-composer
        \                  /                      |
         \                /                       |
          @rexel/ui (View)                        |  UIを通らず直接
                |                                 |
       @rexel/viewmodel (ViewModel)               |
                |                                 |
                +---------------+-----------------+
                                |
                     @rexel/core (Model)
```

Web と VSCode は UI ごと共有し、CLI は UI を飛ばして Model を直接使う。

| パッケージ | 層 | 責務 |
| --- | --- | --- |
| `@rexel/core` | Model | ノードグラフ、評価エンジン、組み込みノード定義、Float32 RGBA の画像処理、.rxc の読み書きとマイグレーション、パス解決、.rxcp の zip 処理、PNG のデコードとエンコード、プラグインローダ |
| `@rexel/viewmodel` | ViewModel | エディタ状態(選択・パン・ズーム)、コマンドと Undo / Redo、購読可能な状態 |
| `@rexel/ui` | View | React コンポーネント(ノードエディタ、プレビュー、インスペクタ) |
| `@rexel/host-web` | Host | ブラウザのファイルアクセス、Web Worker、PWA、GitHub Pages 向けビルド |
| `@rexel/host-vscode` | Host | CustomEditorProvider、webview と拡張本体のメッセージ橋 |
| `rexel-composer` | Host | CLI。コマンド定義、Node の fs、worker_threads |

ホストが実装するインターフェースは3つだけ。

- `ProjectFileSystem`:.rxc からの相対パスで読む・書く・列挙する
- `TaskRunner`:重いノード処理を Web Worker / worker_threads に投げる
- `PluginSandbox`:プラグインのコードを隔離して実行する

core の tsconfig は `types: []` で、DOM も Node の型も読まない。触ればコンパイルエラーになる。

ノードの処理は2種類に分ける。

| 種類 | 動く場所 | 例 |
| --- | --- | --- |
| pure | `TaskRunner` 経由でワーカー。入力の画像とパラメータだけを受け、画像を返す純粋関数 | `core.blur` |
| inline | 評価エンジンと同じスレッド。`ProjectFileSystem` などのホスト資源を使う、または処理がごく軽い | `core.image`、`core.output` |

評価エンジンは対象ノードから上流へたどり、ノードごとに結果をメモ化する。独立した枝は並行して評価する。

リポジトリは pnpm workspaces のモノレポ、ビルドは Vite。TypeScript は strict。ワークスペースのルートの package.json は `rexel-composer-workspace`(非公開)。

## プロジェクトファイル仕様

.rxc は UTF-8 の JSON、.rxcp は .rxc と参照アセットを 1 つにした zip。どちらも、.rxc と同じ階層かそれ以下しか参照できない。

### .rxc のトップレベル

| キー | 型 | 中身 |
| --- | --- | --- |
| `formatVersion` | number | スキーマの版。古い版は読込時にマイグレーションする |
| `meta` | object | プロジェクト名、作成したアプリの版 |
| `canvas` | object | 既定の出力サイズ(width / height) |
| `nodes` | array | id、type(例 `core.blur`、`plugin.<id>.<name>`)、エディタ上の位置、パラメータ |
| `links` | array | 接続元 {node, port} → 接続先 {node, port} |
| `assets` | array | id、相対パス、種類(画像・パレットなど) |
| `plugins` | array | id、版、相対パス |

### .rxc の細則

- 現在の `formatVersion` は 1。今より新しい版は「rexel を更新して」という理由つきで拒否する。マイグレーションの仕組みは版 2 を作るときに足す
- どのオブジェクトも、定義にないキーがあればエラーにする(綴り間違いを黙って無視しない)
- `meta` は `name` と `appVersion`、ノードの位置は `position: { x, y }`
- ノードの `params` は省略でき、省略時は `{}`。各パラメータの既定値はノード定義が持つ
- ノード・アセット・プラグインの id と、リンクのポート名に使えるのは英数字と `_` `-` だけ
- `assets` の種類は `image`(PNG)と `palette`(`.hex`・`.txt`・`.gpl`・`.png`)
- `canvas` は 1 辺 16384 px 以下。扱う画像はすべて 1 辺 16384 px 以下、かつ合計 67,108,864 px 以下(Float32 RGBA で 1 GB)

### パス解決ルール

1. パスは .rxc からの相対パスだけ。区切りは OS に関係なく `/` で保存する
2. 絶対パス、`..` を含むパス、ドライブ文字、URL スキームは読込時に拒否する。`\` 区切り、NUL 文字、空のセグメント(`a//b`)も拒否する。`./` は取り除いてから判定する
3. シンボリックリンクは、解決後の実体が同じ階層以下にあるときだけ許す(CLI・VSCode)
4. このルールは core の1カ所で判定し、全ホストが通る

### .rxcp

- zip のルートに `project.rxc` を 1 つ、参照アセットとプラグインを相対パスそのままで置く
- 書き出し時は `assets` と `plugins` に載っているファイルだけを同梱する(無関係なファイルの混入を防ぐ)
- 読込時もパス解決ルールを同じように適用する(zip slip 対策)
- zip 処理は fflate を使い、全ホストで同じコードを通す

## Web版

Vite で静的ビルドし、GitHub Actions 経由で GitHub Pages にデプロイする。初回のリポジトリ作成と Pages 設定は Claude が `gh` で行う。

読み込みは全ブラウザ共通でフォルダ選択(`<input webkitdirectory>` とドラッグ&ドロップ)に統一する。ブラウザで差が出るのは保存だけで、Chrome / Edge では File System Access API による上書き保存を追加で使える。

| ブラウザ | 開く | 保存 |
| --- | --- | --- |
| すべて | フォルダ選択・ドラッグ&ドロップ・.rxcp | .rxc または .rxcp をダウンロード |
| Chrome / Edge | 同上 | 開いたフォルダへ上書き保存 |

- PWA としてインストールでき、オフラインでも動く(Service Worker でアプリ本体をキャッシュ)
- URL は `https://<user>.github.io/Rexel-Composer/`、Vite の `base` は `/Rexel-Composer/`

## VSCode拡張版

.rxc と .rxcp を VSCode で開くと、そのタブの中で Web 版と同じ `@rexel/ui` が起動する(Snowstorm の体験)。

- `CustomEditorProvider` で `*.rxc` と `*.rxcp` に紐づける
- webview と拡張本体は postMessage の RPC でつなぐ
- 拡張本体が `vscode.workspace.fs` で `ProjectFileSystem` を実装する。パス解決ルールは core 側で判定する
- 編集は VSCode の未保存マーク・Ctrl+S・Undo / Redo と連動させる(`onDidChangeCustomDocument`)
- Undo 履歴の本体は `@rexel/viewmodel` が持つ
- 公開先は VS Code Marketplace と Open VSX

## CLI版

CLI は Node.js(LTS)上の TypeScript で書き、npm で `rexel-composer` として配布する(`npx rexel-composer`)。`rexel` は既存パッケージと被るため避けた。インストール後のコマンド名は `rexel`。作法は [Command Line Interface Guidelines](https://clig.dev/) に従う。

### 守る作法

- stdout には結果データだけ、ログと進捗は stderr
- 終了コード:0 = 成功、1 = 実行エラー、2 = 使い方の誤り
- 全コマンド共通で `-h / --help`、`--version`、`--json`、`-q / --quiet`、`-v / --verbose`
- `NO_COLOR` を尊重し、TTY でないときは色と進捗表示を止める
- ファイル名の代わりに `-` で stdin / stdout を扱える
- 既存ファイルの上書きは `--force` があるときだけ。`--force` なしで既存ファイルを指したら実行エラー(1)
- `--version` だけで、短い形(`-V`)は付けない。`-v` は `--verbose` に使う
- `-q` と `-v` は同時に指定できない(使い方の誤り)
- 引数なしで `rexel` を叩いたらヘルプを出して 2 で終わる。使い方の誤りでは、エラーの後に `--help` の案内を出す
- `-v` はノードごとの処理時間を stderr に出す。進捗は TTY のときだけ、1 行を書き換えて出す

### `--json` の出力

- stdout には JSON を 1 つだけ出す。成功時は `{"ok": true, ...}`(render なら `output`、`node`、`width`、`height`)
- 失敗時は `{"ok": false, "error": {"reason", "node"?, "param"?, "usage"}}`。`usage` が true なら使い方の誤り(終了コード 2)
- `--json` のときは、ヘルプや使い方の案内を stderr にも出さない
- `validate` だけは問題をすべて並べるため `{"ok": false, "errors": [{"reason", "node"?, "param"?}]}` を返す。問題がなければ `{"ok": true, "errors": []}`

### render の細則

- `--node` を省いたときは `core.output` ノードを対象にする。1 つもない、または 2 つ以上あるときは使い方の誤り(2)にして、`--node` を促す
- `--set` の値は JSON として読み、読めなければ文字列として扱う。型と範囲はノード定義で検査する。存在しないノードを指したら実行エラー
- `-` で stdin から .rxc を読むときは、アセットの相対パスをカレントディレクトリから解決する
- `-o -` で PNG を stdout に出す。stdout が TTY なら拒否する。`--json` との併用は使い方の誤り
- 書き出す PNG は 8bit RGBA。行ごとのフィルタは 5 種から自動で選ぶ

### ライブラリ

| 用途 | ライブラリ |
| --- | --- |
| 引数解析 | commander + @commander-js/extra-typings(型付き) |
| 色付き出力 | Node 組み込みの `util.styleText` |
| zip・PNG | core と共通(fflate、core の PNG デコーダ・エンコーダ) |
| ビルド | Vite の SSR ビルド。core と依存ライブラリをすべて dist に同梱するので、配布パッケージは実行時の依存を持たない |

### コマンド

| コマンド | やること |
| --- | --- |
| `rexel render <project> -o <out.png>` | 出力ノードを画像にする。`--node <id>` で対象を選び、`--set <node>.<param>=<value>` でパラメータを上書き |
| `rexel pack <project.rxc> -o <out.rxcp>` | .rxcp にまとめる |
| `rexel unpack <project.rxcp> -o <dir>` | .rxcp を展開する |
| `rexel validate <project>` | スキーマ・ノード定義・リンク・パス解決ルールを検査する |
| `rexel info <project>` | ノード・アセット・プラグインの一覧を出す |
| `rexel nodes` | 使えるノードの定義(ポート・パラメータ・型)を出す |
| `rexel schema` | .rxc の JSON Schema を出す |

## プラグイン

プラグインは ESM の JavaScript(TypeScript で書いてビルド)で、プロジェクトフォルダ内に置く。だから .rxcp に同梱され、共有はファイル添付だけで完結する。

- 型定義パッケージ `@rexel/plugin-api` を npm に公開する。プラグインは `apiVersion` を宣言する
- 提供できるのはノード定義:入出力ポート、パラメータ、処理関数(Float32 RGBA を受けて返す純粋関数)
- Web・VSCode では処理関数を Web Worker 内で動かし、DOM とネットワークに触れさせない
- Node には強いサンドボックスがないので、CLI では `--allow-plugins` を付けたときだけプラグインを読む
- プラグイン入りのプロジェクトを開くときは、Web・VSCode でも実行してよいか確認する(共有ファイルを開いただけでコードが走るのを防ぐ)

## AI対応(Agent Skill)

AI エージェントが .rxc を書いて CLI でレンダまでできるように、リポジトリに Agent Skill を同梱する。

- `skills/rexel-composer/SKILL.md` に、.rxc の構造・ノードのつなぎ方・CLI の使い方をまとめる
- ノード一覧と JSON Schema は手書きせず、`rexel nodes --json` と `rexel schema` で core の定義から生成する。ノードを足すと Skill の知識も自動で追従する
- AI は「.rxc を書く → `rexel validate --json` → `rexel render`」のループで自分で直せる
- CLI のエラーは `--json` でノード id・パラメータ名・理由を返す

## MVPスコープ

v1 のゴールは「画像を読み込み、ノードで加工し、PNG で書き出す」が 3 つの窓すべてで同じ結果になること。

### エディタ機能

- ノードの追加・削除・接続、コピー&ペースト
- パン・ズーム、Undo / Redo
- 選択ノードのプレビューとパラメータ編集
- .rxc の保存・読込、.rxcp の書き出し・読込、PNG 書き出し

### 初期ノード

| カテゴリ | ノード |
| --- | --- |
| 入出力 | 画像読込、出力 |
| 生成 | 単色、グラデーション、ノイズ(Perlin / セル)、図形(矩形 / 円) |
| 色 | 色相・彩度・明度、レベル補正、反転、グレースケール、パレット減色 |
| フィルタ | ぼかし、シャープ、輪郭抽出、ピクセル化、ディザ |
| 変形 | 移動・回転・拡縮、反転、クロップ、タイル |
| 合成 | ブレンド(通常 / 乗算 / スクリーン / 加算 / オーバーレイ)、マスク |
| 値 | 数値、ベクトル、色(パラメータの共有用) |

### ノード定義の置き場所

初期ノードはすべて core に実装済み(25 種)。各ノードのポート・パラメータ・範囲・既定値の正は core のノード定義で、`rexel nodes` で一覧できる。手書きの一覧は持たず、`pnpm skill` が `skills/rexel-composer/references/nodes.md` を生成する。

- 画像のポート名は `image`。合成系は `base` と `layer`、マスクは `mask` のように役割で名付ける。値ノード(数値・ベクトル・色)の出力は `value`
- 数値・整数・色・ベクトルのパラメータは、パラメータ名をポート名にしてリンクで受けられる。リンク中のパラメータは `params` の値を無視する
- `core.blur` はガウシアン(σ = radius / 3、カーネル半径は radius の切り上げ)。縦横に分けて畳み込み、端は端の画素を延ばす。透明部分のふちが濁らないよう、計算中だけ premultiplied alpha にする

### PNG の読込

- 色の種類はすべて(グレー、RGB、パレット、グレー+α、RGBA)、ビット深度は 1〜16 bit、`tRNS` の透過に対応する
- チャンクの CRC を検査する。`gAMA` や `iCCP` などの補助チャンクは読まない(計算は sRGB のまま)

### v1 に入れないもの

アニメーションとタイムライン、3D、パーティクル、本家 .pxc のインポート、共有サービス、共同編集。

## 実装の現状(2026-11-19)

仕様はすべて実装済み。残っているのは、ユーザーのアカウントが要る公開作業だけ。

- npm への `rexel-composer` と `@rexel/plugin-api` の公開
- VS Code Marketplace と Open VSX への公開(`pnpm --filter rexel-composer-vscode package` で .vsix は作れる)

### Web 版の細則

- 開くとき、フォルダに .rxc / .rxcp が複数あれば選ばせる
- Chrome / Edge ではフォルダを `showDirectoryPicker` で開き、Ctrl+S でそのフォルダへ上書きする。「Save to Folder」で別のフォルダへ保存できる
- 上書き先のないブラウザでの保存は .rxc のダウンロード。追加したアセットがまだどこにも書かれていなければ、失わないよう .rxcp をダウンロードする
- 追加したアセットは `assets/` に置き、保存するまでメモリに持つ
- 未保存の変更があるときは、別のプロジェクトを開く前とページを閉じる前に確認する
- ビルドした index.html に CSP を入れる(`connect-src 'self' data:`、`script-src 'self' blob:`)。プラグインのワーカーは CSP に加えて `fetch`・`WebSocket`・`importScripts` などを読込前に潰す
- 同梱サンプルは `examples/` をビルド時に取り込み、最初の画面から開ける

### VSCode 版の細則

- webview は `retainContextWhenHidden` で保つ。ワーカーは blob の inline ワーカー(CSP は `worker-src blob:`)
- プラグイン入りのプロジェクトは、開くときにモーダルで実行してよいか確認し、文書ごとに覚える
- アセットを追加すると、.rxc のフォルダの外のファイルは `assets/` にコピーする。.rxcp ではアーカイブの中に入れ、保存時に詰め直す
- Undo / Redo の単位は viewmodel の履歴と同じ(同じ操作の連続はまとめる)。VSCode からの Undo は webview の履歴を 1 つ戻す
- コマンドパレットには `RexelComposer: New Project` と、Undo / Redo 以外の編集コマンドを登録する

## コーディング規約・UI原則

コードは名前と構造だけで意図を伝え、ルールは可能な限り Lint で機械的に強制する。

- 「あとで使うかも」で層・抽象・拡張ポイントを足さない。今の要件に要るものだけ作る
- テストコードは書かない。代わりに `examples/` にサンプル .rxc を置き、`rexel render` で一括レンダして目で確かめられる状態を保つ。一括レンダは `pnpm render:examples` で、結果は `examples/out/`(git の対象外)に出る
- コメントは書かない
- 責務ごとにクラスを分ける
- マジックナンバーは意味のある名前の定数にする(例 `DEFAULT_CANVAS_WIDTH`)
- Lint と整形は ESLint + Prettier。`no-magic-numbers` と `no-warning-comments` 系のルールで上の規約を強制する
  - コメントは、eslint.config.js に直接書いたローカルルール `rexel/no-comments` ですべて禁止する。`noInlineConfig` で、ファイル内からルールを無効にすることも禁じる
  - マジックナンバーで許すのは -1、0、1、2 だけ(`2σ²` や「半分」のような式の中の定数のため)。enum の値と既定値は対象外
  - インターフェースのメソッドはプロパティの形で書く(`method-signature-style`)。React の props を分割代入しても `this` を失わないため
  - `!`(非 null 表明)は許す。`noUncheckedIndexedAccess` の下で、画素ループの型付き配列の添字に毎回分岐を書かないため
  - Prettier は `docs/` と `CLAUDE.md` を整形しない(人が書いた文書の表を崩さないため)

## UI

UI は VSCode と同じ見た目にする。色・文字・余白は VSCode のテーマ変数(`--vscode-*`)の名前をそのままトークンに使い、仕上げに `/unslop` をかける。

### 色トークン

VSCode 版では VSCode が webview に注入する値をそのまま使うので、ユーザーのテーマに自動で追従する。Web 版では同じ変数名に、VSCode 標準テーマ(Dark Modern / Light Modern)の値を定義する。

| トークン | Dark Modern | Light Modern | 使う場所 |
| --- | --- | --- | --- |
| `--vscode-editor-background` | #1F1F1F | #FFFFFF | ノードキャンバス |
| `--vscode-sideBar-background` | #181818 | #F8F8F8 | ノード一覧・インスペクタ |
| `--vscode-panel-background` | #181818 | #F8F8F8 | プレビュー |
| `--vscode-editorWidget-background` | #202020 | #F8F8F8 | ノード本体・メニュー |
| `--vscode-foreground` | #CCCCCC | #3B3B3B | 文字 |
| `--vscode-focusBorder` | #0078D4 | #005FB8 | フォーカスリング・選択中のノード |
| `--vscode-button-background` | #0078D4 | #005FB8 | 主ボタン |
| `--vscode-button-hoverBackground` | #026EC1 | #0258A8 | 主ボタンの hover |
| `--vscode-input-background` | #313131 | #FFFFFF | 入力欄 |
| `--vscode-input-border` | #3C3C3C | #CECECE | 入力欄の枠 |
| `--vscode-widget-border` | #313131 | #E5E5E5 | ノードの枠 |
| `--vscode-panel-border` | #2B2B2B | #E5E5E5 | 領域の区切り線 |
| `--vscode-errorForeground` | #F85149 | #F85149 | エラー |
| `--vscode-button-secondaryBackground` | #313131 | #E5E5E5 | 副ボタン |
| `--vscode-button-secondaryForeground` | #CCCCCC | #3B3B3B | 副ボタンの文字 |
| `--vscode-button-secondaryHoverBackground` | #3C3C3C | #CCCCCC | 副ボタンの hover |
| `--vscode-button-foreground` | #FFFFFF | #FFFFFF | 主ボタンの文字 |
| `--vscode-input-foreground` | #CCCCCC | #3B3B3B | 入力欄の文字 |
| `--vscode-list-hoverBackground` | #2A2D2E | #F2F2F2 | 一覧の hover |
| `--vscode-list-activeSelectionBackground` | #04395E | #E8E8E8 | コマンドパレットの選択行 |
| `--vscode-list-activeSelectionForeground` | #FFFFFF | #000000 | 選択行の文字 |
| `--vscode-toolbar-hoverBackground` | #5A5D5E50 | #B8B8B850 | アイコンボタンの hover |
| `--vscode-titleBar-activeBackground` | #181818 | #F8F8F8 | Web 版のツールバー |

- `--vscode-descriptionForeground`(説明用の薄い文字色)は使わない。セカンダリテキストを使わないため
- Tailwind の色は `@theme` でこの表のトークンにだけつなぎ、Tailwind 標準のパレットは使わない
- Web 版の値は `@layer` の低い層に置き、VSCode が注入する値が必ず勝つようにする
- ハイコントラストテーマでは `--vscode-contrastBorder` で枠を出す
- ノードキャンバスの点の格子は `--vscode-foreground` を `color-mix` で薄めて描く。ズームに合わせて間隔を倍々にし、画面上で 12px より細かくしない
- 画面幅が 48rem 未満では、ノード一覧を隠し(追加はコマンドパレットから)、エディタ・プレビュー・インスペクタを縦に積む

### レイアウトと部品(VSCode UX ガイドラインから必要な分だけ)

- 領域は VSCode に合わせる:エディタ = ノードキャンバス、プライマリサイドバー = ノード一覧、セカンダリサイドバー = インスペクタ、パネル = プレビュー
- アイコンは Codicons(`@vscode/codicons`)だけを使う
- 文字は `--vscode-font-family` と `--vscode-font-size`、数値入力などの等幅は `--vscode-editor-font-family`
- すべての操作をコマンドとして公開する。Web 版はコマンドパレット(Ctrl+Shift+P)、VSCode 版は VSCode のコマンドとして登録する
- 色のコントラスト、ARIA ラベル、キーボード操作を満たす

### CSS の書き方(Ubie の Dos / Don'ts から本プロジェクトに関わる分)

- 余白と寸法は論理プロパティで書く。骨格は Grid(`grid-template-areas`)、中身の並びは Flexbox + `gap`
- 詳細度は `@layer` と `:where()` で管理する。BEM などの命名規則は入れない
- 色・余白の直書きはしない。hover などの濃淡は `color-mix(in oklab, …)` で 30% 以内
- `:root` に `color-scheme: light dark` を指定し、Web 版の配色は `light-dark()` で切り替える
- フォーカスは `:focus-visible` + `outline`。代替なしの `outline: none` は禁止
- メニューやツールチップは `popover`、モーダルは `<dialog>` の `.showModal()`。`z-index` 管理をしない
- スクロール領域は `overflow: auto` + `scrollbar-gutter: stable` + `overscroll-behavior: contain`
- `touch-action: none` はノードキャンバスにだけ付ける
- `font-size` は `rem` / `em`、`line-height` は単位なし
- 子の状態で親の見た目を変えるときは `:has()` を使い、JavaScript でクラスを付け外ししない
- アニメーションは `opacity` と `transform` だけにする
- ボタンは `<button>` を使い、`<input type="button">` は使わない

### 仕上げ

- UI ができたら最後に `/unslop` を実行して、量産型 AI っぽい見た目を取り除く

## ライセンス

本家 Pixel Composer は MIT ライセンスなので、コード・シェーダ・アルゴリズムを移植してよい。その場合、本家の著作権表示と MIT 全文を `THIRD_PARTY_NOTICES` に残す。

- 本家の名前やロゴは RexelComposer のブランドに使わない(紹介で「Pixel Composer に着想を得た」と書くのはよい)
- RexelComposer 自身のライセンスは MIT

## 参考資料

- [Pixel Composer](https://github.com/Ttanasart-pt/Pixel-Composer)
- [Command Line Interface Guidelines](https://clig.dev/)
- [モダンCSSの Dos / Don'ts(Ubie)](https://zenn.dev/ubie_dev/articles/modern-css-dos-donts)
- [VS Code UX Guidelines: Overview](https://code.visualstudio.com/api/ux-guidelines/overview)
- [VS Code UX Guidelines: Webviews](https://code.visualstudio.com/api/ux-guidelines/webviews)
- [Dark Modern テーマ定義](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json)
- [Light Modern テーマ定義](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/light_modern.json)
