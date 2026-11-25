#!/system/bin/sh
# 大肥鱼记账 · 构建脚本
#
# 用法：
#   sh build.sh
#
# 签名密钥不随仓库分发。想打出可以覆盖升级的正式包，需要自己有那把 keystore：
#   1) 把 keystore 放到任意位置，用 KS 指定：   KS=/path/to/your.keystore sh build.sh
#   2) 密码用环境变量给：                        DAFISH_KS_PASS=你的密码
#      （或者写进脚本同目录的 .kspass 文件，该文件已在 .gitignore 里被排除）
# 没有密钥也能构建，只是产出的是未签名包，装不上，仅供检查编译是否通过。

set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="$SRC/build"
VERSION="0.9"                       # 改版本号只改这里（和 assets/index.html 的 APP_VERSION 保持一致）
OUTNAME="dafish-account-book-v${VERSION}"
DIST="$(dirname "$SRC")"

AAPT="$(command -v aapt)"
ZIPALIGN="$(command -v zipalign)"
APKSIGNER="$(command -v apksigner)"
D8="$(command -v d8)"
JAVAC="$(command -v javac)"
AJAR="${HOME:-/data/user/0/app.dsh.mobile/files/dsh-home}/android.jar"

[ -f "$AJAR" ] || { echo "找不到 android.jar: $AJAR"; exit 1; }

grep -q "APP_VERSION = '${VERSION}'" "$SRC/assets/index.html" || \
  echo "⚠️  assets/index.html 里的 APP_VERSION 和 build.sh 的 VERSION 不一致，检查一下"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/dex"

echo "[1/6] javac"
"$JAVAC" -source 8 -target 8 -bootclasspath "$AJAR" -classpath "$AJAR" \
  -d "$OUT/classes" "$SRC"/java/com/dafish/money/*.java 2>&1 | grep -v "bootstrap class path" || true

echo "[2/6] d8"
"$D8" --release --min-api 21 --lib "$AJAR" --output "$OUT/dex" \
  $(find "$OUT/classes" -name "*.class")

echo "[3/6] aapt package"
"$AAPT" package -f -M "$SRC/AndroidManifest.xml" -S "$SRC/res" -A "$SRC/assets" \
  -I /system/framework/framework-res.apk -F "$OUT/app-unsigned.apk"

echo "[4/6] 加入 classes.dex"
( cd "$OUT/dex" && zip -q -j "$OUT/app-unsigned.apk" classes.dex )

echo "[5/6] zipalign"
"$ZIPALIGN" -f 4 "$OUT/app-unsigned.apk" "$OUT/app-aligned.apk"

echo "[6/6] 签名"
# 密钥路径：优先用 KS 环境变量，其次找脚本同目录 / 上级目录里的 keystore
[ -n "$KS" ] && [ -f "$KS" ] || {
  for c in "$SRC"/*.keystore "$SRC"/../*.keystore; do
    [ -f "$c" ] && { KS="$c"; break; }
  done
}
# 密码：优先环境变量，其次 .kspass 文件（不进仓库）
[ -n "$DAFISH_KS_PASS" ] || {
  for f in "$SRC/.kspass" "$SRC/../.kspass"; do
    [ -f "$f" ] && { DAFISH_KS_PASS="$(cat "$f")"; break; }
  done
}

if [ -z "$KS" ] || [ ! -f "$KS" ]; then
  cp -f "$OUT/app-aligned.apk" "$DIST/$OUTNAME-unsigned.apk"
  echo "未找到签名密钥，只产出未签名包：$DIST/$OUTNAME-unsigned.apk"
  echo "（想打正式包：KS=/path/your.keystore DAFISH_KS_PASS=密码 sh build.sh）"
  exit 0
fi
if [ -z "$DAFISH_KS_PASS" ]; then
  cp -f "$OUT/app-aligned.apk" "$DIST/$OUTNAME-unsigned.apk"
  echo "找到了密钥但没有密码（DAFISH_KS_PASS 或 .kspass），只产出未签名包"
  exit 0
fi

"$APKSIGNER" sign --ks "$KS" --ks-pass "pass:$DAFISH_KS_PASS" --key-pass "pass:$DAFISH_KS_PASS" \
  --out "$OUT/$OUTNAME.apk" "$OUT/app-aligned.apk"

cp -f "$OUT/$OUTNAME.apk" "$DIST/$OUTNAME.apk"
echo "完成: $DIST/$OUTNAME.apk  $(stat -c %s "$DIST/$OUTNAME.apk") bytes"
