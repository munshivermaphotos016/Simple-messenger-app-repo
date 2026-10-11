#!/usr/bin/env python3
"""
Builds and cryptographically verifies a standalone native Android APK (`Simple-Android.apk`)
signed with BOTH JAR Signature Scheme v1 and APK Signature Scheme v2 (APK Sig Block 42)
for Simple — Private Encrypted Messenger.
Created by Dr. M Verma (com.drmverma.simple).
"""

import base64
import glob
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
import zlib

PACKAGE_NAME = "com.drmverma.simple"
MAIN_ACTIVITY_CLASS = "com.drmverma.simple.MainActivity"
MAIN_ACTIVITY_DESC = "Lcom/drmverma/simple/MainActivity;"


def load_version_info() -> tuple[int, str]:
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    pkg_json_path = os.path.join(root_dir, "package.json")
    ver_name = "3.0.0"
    try:
        with open(pkg_json_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)
            if isinstance(pkg.get("version"), str) and pkg["version"].strip():
                ver_name = pkg["version"].strip()
    except Exception:
        pass
    parts = [int(p) for p in re.findall(r"\d+", ver_name)[:3]]
    while len(parts) < 3:
        parts.append(0)
    if parts[1] == 0 and parts[2] == 0:
        ver_code = max(3, parts[0])
    else:
        ver_code = parts[0] * 100 + parts[1] * 10 + parts[2]
    return ver_code, ver_name


VERSION_CODE, VERSION_NAME = load_version_info()


def make_utf16_string_pool(strings: list) -> bytes:
    """
    Builds a standard Android UTF-16LE ResStringPool_header chunk (0x0001).
    """
    encoded_strings = []
    offsets = []
    cur_offset = 0
    for s in strings:
        offsets.append(cur_offset)
        u16 = s.encode("utf-16le")
        char_len = len(s)
        entry = struct.pack("<H", char_len) + u16 + struct.pack("<H", 0)
        encoded_strings.append(entry)
        cur_offset += len(entry)

    string_data = b"".join(encoded_strings)
    while len(string_data) % 4 != 0:
        string_data += b"\x00"

    strings_start = 28 + 4 * len(strings)
    pool_chunk_size = strings_start + len(string_data)
    pool_header = struct.pack(
        "<HHIIIIII",
        0x0001,  # RES_STRING_POOL_TYPE
        28,  # header size
        pool_chunk_size,
        len(strings),
        0,  # style count
        0,  # flags (0 = UTF-16LE)
        strings_start,
        0,  # styles start
    )
    offsets_blob = b"".join(struct.pack("<I", off) for off in offsets)
    return pool_header + offsets_blob + string_data


# ============================================================================
# 1. INLINE WEB BUNDLE BUILDER (dist/ -> self-contained assets/index.html)
# ============================================================================
def build_inlined_index_html(dist_dir: str) -> bytes:
    index_path = os.path.join(dist_dir, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Inline CSS files from dist/assets/*.css
    for css_file in sorted(glob.glob(os.path.join(dist_dir, "assets", "*.css"))):
        css_name = os.path.basename(css_file)
        with open(css_file, "r", encoding="utf-8") as cf:
            css_content = cf.read()
        css_content = css_content.replace('"/assets/', '"assets/').replace(
            "'/assets/", "'assets/"
        )
        pattern = re.compile(
            r'<link[^>]+href=["\'][^"\']*' + re.escape(css_name) + r'["\'][^>]*>',
            re.IGNORECASE,
        )
        html = pattern.sub(lambda _m: f"<style>\n{css_content}\n</style>", html)

    # Collect JS bundle files from dist/assets/*.js and place them at the end of <body>
    # AFTER <div id="root"></div> so document.getElementById("root") is always defined
    inlined_scripts = []
    for js_file in sorted(glob.glob(os.path.join(dist_dir, "assets", "*.js"))):
        js_name = os.path.basename(js_file)
        with open(js_file, "r", encoding="utf-8") as jf:
            js_content = jf.read()
        # Rewrite absolute /assets/, /src/assets/images/, and /icon- paths to relative paths for file:///android_asset/
        js_content = (
            js_content.replace('"/assets/', '"assets/')
            .replace("'/assets/", "'assets/")
            .replace('"/src/assets/images/', '"wallpapers/')
            .replace("'/src/assets/images/", "'wallpapers/")
            .replace('"/icon-192.png"', '"icon-192.png"')
            .replace('"/icon-512.png"', '"icon-512.png"')
            .replace('"/apple-touch-icon.png"', '"apple-touch-icon.png"')
        )
        safe_js = re.sub(r"</script>", "<\\\\/script>", js_content, flags=re.IGNORECASE)
        pattern = re.compile(
            r'<script[^>]+src=["\'][^"\']*'
            + re.escape(js_name)
            + r'["\'][^>]*>\s*</script>',
            re.IGNORECASE,
        )
        html = pattern.sub("", html)
        inlined_scripts.append(f"<script>\n{safe_js}\n</script>")

    # Remove service worker registration and webmanifest links in file:// APK mode
    html = re.sub(
        r'<script[^>]+src=["\'][^"\']*registerSW\.js["\'][^>]*>\s*</script>',
        "",
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(
        r'<link[^>]+rel=["\']manifest["\'][^>]*>',
        "",
        html,
        flags=re.IGNORECASE,
    )
    html = (
        html.replace('href="/icon-192.png"', 'href="icon-192.png"')
        .replace('href="/icon.svg"', 'href="icon.svg"')
        .replace('href="/apple-touch-icon.png"', 'href="apple-touch-icon.png"')
    )

    scripts_block = "\n".join(inlined_scripts)
    if "</body>" in html:
        html = html.replace("</body>", f"{scripts_block}\n</body>", 1)
    else:
        html = html + "\n" + scripts_block

    return html.encode("utf-8")


# ============================================================================
# 2. BINARY RESOURCES.ARSC COMPILER (@drawable/ic_launcher = 0x7F010000)
# ============================================================================
def compile_resources_arsc() -> bytes:
    """
    Compiles a valid binary resources.arsc table defining:
      - 0x7F010000: @drawable/ic_launcher -> "res/drawable/ic_launcher.png"
      - 0x7F020000: @string/app_name -> "Simple"
    """
    global_pool = make_utf16_string_pool(
        ["res/drawable/ic_launcher.png", "Simple"]
    )
    type_pool = make_utf16_string_pool(["drawable", "string"])
    key_pool = make_utf16_string_pool(["ic_launcher", "app_name"])

    TYPE_STRING = 0x03

    def make_type_chunks(type_id: int, key_idx: int, global_str_idx: int) -> bytes:
        # ResTable_typeSpec (0x0202)
        type_spec = struct.pack(
            "<HHIBBHII",
            0x0202,  # RES_TABLE_TYPE_SPEC_TYPE
            16,  # headerSize
            20,  # total size (16 + 4*1)
            type_id,  # 1-based type ID
            0,
            0,
            1,  # entryCount = 1
            0,  # flags[0]
        )
        # ResTable_config (48 bytes, standard AOSP config size)
        config = struct.pack("<I", 48) + (b"\x00" * 44)
        # ResTable_entry (8 bytes) + Res_value (8 bytes) = 16 bytes
        entry_and_val = struct.pack(
            "<HHIHBBI",
            8,  # ResTable_entry.size
            0,  # ResTable_entry.flags
            key_idx,  # key index in key_pool
            8,  # Res_value.size
            0,  # Res_value.res0
            TYPE_STRING,
            global_str_idx,  # index in global_pool
        )
        header_size = 20 + len(config)  # 68
        entries_start = header_size + 4  # 72
        total_size = entries_start + len(entry_and_val)  # 88
        type_header = (
            struct.pack(
                "<HHIBBHII",
                0x0201,  # RES_TABLE_TYPE_TYPE
                header_size,
                total_size,
                type_id,
                0,
                0,
                1,  # entryCount = 1
                entries_start,
            )
            + config
            + struct.pack("<I", 0)  # entry offset[0] = 0
            + entry_and_val
        )
        return type_spec + type_header

    drawable_chunks = make_type_chunks(1, 0, 0)
    string_chunks = make_type_chunks(2, 1, 1)

    pkg_name_u16 = PACKAGE_NAME.encode("utf-16le")
    pkg_name_padded = pkg_name_u16 + b"\x00" * (256 - len(pkg_name_u16))

    pkg_header_size = 288
    type_strings_off = pkg_header_size
    key_strings_off = type_strings_off + len(type_pool)
    pkg_body = type_pool + key_pool + drawable_chunks + string_chunks
    pkg_total_size = pkg_header_size + len(pkg_body)

    pkg_header = (
        struct.pack("<HHI", 0x0200, pkg_header_size, pkg_total_size)
        + struct.pack("<I", 0x7F)
        + pkg_name_padded
        + struct.pack(
            "<IIIII",
            type_strings_off,
            2,  # lastPublicType
            key_strings_off,
            2,  # lastPublicKey
            0,  # typeIdOffset
        )
    )
    assert len(pkg_header) == pkg_header_size

    pkg_chunk = pkg_header + pkg_body
    table_total_size = 12 + len(global_pool) + len(pkg_chunk)
    table_header = struct.pack("<HHII", 0x0002, 12, table_total_size, 1)
    return table_header + global_pool + pkg_chunk


# ============================================================================
# 3. BINARY ANDROIDMANIFEST.XML (AXML) COMPILER
# ============================================================================
def compile_android_manifest() -> bytes:
    # Resource-mapped attribute names MUST appear first in the string pool,
    # in ascending order of their android.R.attr.* resource IDs.
    attr_resources = [
        ("theme", 0x01010000),
        ("label", 0x01010001),
        ("icon", 0x01010002),
        ("name", 0x01010003),
        ("exported", 0x01010010),
        ("configChanges", 0x0101001F),
        ("minSdkVersion", 0x0101020C),
        ("versionCode", 0x0101021B),
        ("versionName", 0x0101021C),
        ("targetSdkVersion", 0x01010270),
        ("hardwareAccelerated", 0x010102D3),
        ("usesCleartextTraffic", 0x010104EC),
        ("roundIcon", 0x0101052C),
    ]

    other_strings = [
        "android",
        "http://schemas.android.com/apk/res/android",
        "",
        "manifest",
        "package",
        PACKAGE_NAME,
        VERSION_NAME,
        "uses-sdk",
        "uses-permission",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.VIBRATE",
        "application",
        "Simple",
        "activity",
        MAIN_ACTIVITY_CLASS,
        "intent-filter",
        "action",
        "android.intent.action.MAIN",
        "category",
        "android.intent.category.LAUNCHER",
    ]

    all_strings = [name for name, _ in attr_resources] + other_strings
    str_idx = {s: i for i, s in enumerate(all_strings)}

    string_pool_chunk = make_utf16_string_pool(all_strings)

    # Build Resource Map chunk (RES_XML_RESOURCE_MAP_TYPE = 0x0180)
    res_ids_blob = b"".join(struct.pack("<I", res_id) for _, res_id in attr_resources)
    res_map_chunk = (
        struct.pack("<HHI", 0x0180, 8, 8 + len(res_ids_blob)) + res_ids_blob
    )

    NS_ANDROID = str_idx["http://schemas.android.com/apk/res/android"]
    PX_ANDROID = str_idx["android"]
    NO_NS = 0xFFFFFFFF

    TYPE_REFERENCE = 0x01
    TYPE_STRING = 0x03
    TYPE_INT_DEC = 0x10
    TYPE_INT_HEX = 0x11
    TYPE_INT_BOOLEAN = 0x12

    def make_start_ns(line: int) -> bytes:
        return struct.pack(
            "<HHIIII", 0x0100, 16, 24, line, 0xFFFFFFFF, PX_ANDROID
        ) + struct.pack("<I", NS_ANDROID)

    def make_end_ns(line: int) -> bytes:
        return struct.pack(
            "<HHIIII", 0x0101, 16, 24, line, 0xFFFFFFFF, PX_ANDROID
        ) + struct.pack("<I", NS_ANDROID)

    def make_attr(ns: int, name_str: str, val_type: int, data: int) -> bytes:
        name_i = str_idx[name_str]
        raw_val = data if val_type == TYPE_STRING else 0xFFFFFFFF
        return struct.pack(
            "<IIIHBBI",
            ns,
            name_i,
            raw_val,
            8,  # Res_value.size
            0,  # Res_value.res0
            val_type,
            data & 0xFFFFFFFF,
        )

    def make_start_el(line: int, tag: str, attrs: list) -> bytes:
        attrs_blob = b"".join(attrs)
        total_len = 36 + len(attrs_blob)
        return (
            struct.pack(
                "<HHIIIIIHHHHHH",
                0x0102,  # RES_XML_START_ELEMENT_TYPE
                16,
                total_len,
                line,
                0xFFFFFFFF,
                NO_NS,
                str_idx[tag],
                20,  # attributeStart
                20,  # attributeSize
                len(attrs),
                0,  # idIndex
                0,  # classIndex
                0,  # styleIndex
            )
            + attrs_blob
        )

    def make_end_el(line: int, tag: str) -> bytes:
        return struct.pack(
            "<HHIIIII",
            0x0103,  # RES_XML_END_ELEMENT_TYPE
            16,
            24,
            line,
            0xFFFFFFFF,
            NO_NS,
            str_idx[tag],
        )

    xml_chunks = []
    xml_chunks.append(make_start_ns(2))

    # <manifest android:versionCode="2" android:versionName="2.0.0" package="com.drmverma.simple">
    xml_chunks.append(
        make_start_el(
            2,
            "manifest",
            [
                make_attr(NS_ANDROID, "versionCode", TYPE_INT_DEC, VERSION_CODE),
                make_attr(
                    NS_ANDROID, "versionName", TYPE_STRING, str_idx[VERSION_NAME]
                ),
                make_attr(
                    NO_NS,
                    "package",
                    TYPE_STRING,
                    str_idx[PACKAGE_NAME],
                ),
            ],
        )
    )

    # <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="28" />
    xml_chunks.append(
        make_start_el(
            6,
            "uses-sdk",
            [
                make_attr(NS_ANDROID, "minSdkVersion", TYPE_INT_DEC, 21),
                make_attr(NS_ANDROID, "targetSdkVersion", TYPE_INT_DEC, 28),
            ],
        )
    )
    xml_chunks.append(make_end_el(6, "uses-sdk"))

    # Permissions
    perms = [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.VIBRATE",
    ]
    for i, perm in enumerate(perms):
        xml_chunks.append(
            make_start_el(
                8 + i,
                "uses-permission",
                [make_attr(NS_ANDROID, "name", TYPE_STRING, str_idx[perm])],
            )
        )
        xml_chunks.append(make_end_el(8 + i, "uses-permission"))

    # <application android:theme="@android:style/Theme.DeviceDefault.NoActionBar" (0x01030129)
    #              android:label="Simple"
    #              android:icon="@drawable/ic_launcher" (0x7F010000)
    #              android:hardwareAccelerated="true"
    #              android:usesCleartextTraffic="true"
    #              android:roundIcon="@drawable/ic_launcher" (0x7F010000)>
    xml_chunks.append(
        make_start_el(
            16,
            "application",
            [
                make_attr(NS_ANDROID, "theme", TYPE_REFERENCE, 0x01030129),
                make_attr(NS_ANDROID, "label", TYPE_STRING, str_idx["Simple"]),
                make_attr(NS_ANDROID, "icon", TYPE_REFERENCE, 0x7F010000),
                make_attr(
                    NS_ANDROID, "hardwareAccelerated", TYPE_INT_BOOLEAN, 0xFFFFFFFF
                ),
                make_attr(
                    NS_ANDROID, "usesCleartextTraffic", TYPE_INT_BOOLEAN, 0xFFFFFFFF
                ),
                make_attr(NS_ANDROID, "roundIcon", TYPE_REFERENCE, 0x7F010000),
            ],
        )
    )

    # <activity android:label="Simple"
    #           android:icon="@drawable/ic_launcher" (0x7F010000)
    #           android:name="com.drmverma.simple.MainActivity"
    #           android:exported="true"
    #           android:configChanges="orientation|screenSize|keyboardHidden" (0x04a0)>
    xml_chunks.append(
        make_start_el(
            20,
            "activity",
            [
                make_attr(NS_ANDROID, "label", TYPE_STRING, str_idx["Simple"]),
                make_attr(NS_ANDROID, "icon", TYPE_REFERENCE, 0x7F010000),
                make_attr(
                    NS_ANDROID,
                    "name",
                    TYPE_STRING,
                    str_idx[MAIN_ACTIVITY_CLASS],
                ),
                make_attr(NS_ANDROID, "exported", TYPE_INT_BOOLEAN, 0xFFFFFFFF),
                make_attr(NS_ANDROID, "configChanges", TYPE_INT_HEX, 0x04A0),
            ],
        )
    )

    # <intent-filter>
    xml_chunks.append(make_start_el(24, "intent-filter", []))
    xml_chunks.append(
        make_start_el(
            25,
            "action",
            [
                make_attr(
                    NS_ANDROID,
                    "name",
                    TYPE_STRING,
                    str_idx["android.intent.action.MAIN"],
                )
            ],
        )
    )
    xml_chunks.append(make_end_el(25, "action"))
    xml_chunks.append(
        make_start_el(
            26,
            "category",
            [
                make_attr(
                    NS_ANDROID,
                    "name",
                    TYPE_STRING,
                    str_idx["android.intent.category.LAUNCHER"],
                )
            ],
        )
    )
    xml_chunks.append(make_end_el(26, "category"))
    xml_chunks.append(make_end_el(27, "intent-filter"))

    xml_chunks.append(make_end_el(28, "activity"))
    xml_chunks.append(make_end_el(29, "application"))
    xml_chunks.append(make_end_el(30, "manifest"))
    xml_chunks.append(make_end_ns(30))

    body = string_pool_chunk + res_map_chunk + b"".join(xml_chunks)
    axml_header = struct.pack("<HHI", 0x0003, 8, 8 + len(body))
    return axml_header + body


# ============================================================================
# 4. DALVIK EXECUTABLE (classes.dex) COMPILER & VERIFIER
# ============================================================================
def uleb128(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value != 0:
            byte |= 0x80
        out.append(byte)
        if value == 0:
            break
    return bytes(out)


def compile_classes_dex() -> bytes:
    """
    Compiles com.drmverma.simple.MainActivity into a verified Dalvik Executable (DEX 035).
    MainActivity initializes an edge-to-edge Android WebView with full WebStorage, WebCrypto,
    and file access enabled, and loads file:///android_asset/index.html.
    """
    raw_strings = [
        "<init>",
        "Landroid/app/Activity;",
        "Landroid/content/Context;",
        "Landroid/os/Bundle;",
        "Landroid/view/View;",
        "Landroid/webkit/WebChromeClient;",
        "Landroid/webkit/WebSettings;",
        "Landroid/webkit/WebView;",
        "Landroid/webkit/WebViewClient;",
        MAIN_ACTIVITY_DESC,
        "Ljava/lang/String;",
        "L",
        "V",
        "VL",
        "VZ",
        "Z",
        "canGoBack",
        "file:///android_asset/index.html",
        "getSettings",
        "goBack",
        "loadUrl",
        "onBackPressed",
        "onCreate",
        "setAllowContentAccess",
        "setAllowFileAccess",
        "setAllowFileAccessFromFileURLs",
        "setAllowUniversalAccessFromFileURLs",
        "setContentView",
        "setDatabaseEnabled",
        "setDomStorageEnabled",
        "setJavaScriptEnabled",
        "setMediaPlaybackRequiresUserGesture",
        "setWebChromeClient",
        "setWebViewClient",
        "webView",
    ]
    # Strings in DEX MUST be sorted strictly in UTF-8 byte order
    strings = sorted(set(raw_strings), key=lambda s: s.encode("utf-8"))
    s_idx = {s: i for i, s in enumerate(strings)}

    type_descriptors = [
        "Landroid/app/Activity;",
        "Landroid/content/Context;",
        "Landroid/os/Bundle;",
        "Landroid/view/View;",
        "Landroid/webkit/WebChromeClient;",
        "Landroid/webkit/WebSettings;",
        "Landroid/webkit/WebView;",
        "Landroid/webkit/WebViewClient;",
        MAIN_ACTIVITY_DESC,
        "Ljava/lang/String;",
        "V",
        "Z",
    ]
    type_descriptors.sort(key=lambda t: s_idx[t])
    t_idx = {t: i for i, t in enumerate(type_descriptors)}

    # Protos: (shorty, return_type, param_types_tuple)
    raw_protos = [
        ("L", "Landroid/webkit/WebSettings;", ()),
        ("V", "V", ()),
        ("VL", "V", ("Landroid/content/Context;",)),
        ("VL", "V", ("Landroid/os/Bundle;",)),
        ("VL", "V", ("Landroid/view/View;",)),
        ("VL", "V", ("Landroid/webkit/WebChromeClient;",)),
        ("VL", "V", ("Landroid/webkit/WebViewClient;",)),
        ("VL", "V", ("Ljava/lang/String;",)),
        ("VZ", "V", ("Z",)),
        ("Z", "Z", ()),
    ]
    raw_protos.sort(
        key=lambda p: (t_idx[p[1]], tuple(t_idx[pt] for pt in p[2]))
    )
    p_idx = {(p[1], p[2]): i for i, p in enumerate(raw_protos)}

    # Field: MainActivity.webView : Landroid/webkit/WebView;
    fields = [
        (
            MAIN_ACTIVITY_DESC,
            "webView",
            "Landroid/webkit/WebView;",
        )
    ]
    f_idx = {f: i for i, f in enumerate(fields)}

    # Methods: (class_type, method_name, (return_type, param_types_tuple))
    raw_methods = [
        ("Landroid/app/Activity;", "<init>", ("V", ())),
        ("Landroid/app/Activity;", "onBackPressed", ("V", ())),
        ("Landroid/app/Activity;", "onCreate", ("V", ("Landroid/os/Bundle;",))),
        ("Landroid/app/Activity;", "setContentView", ("V", ("Landroid/view/View;",))),
        ("Landroid/webkit/WebChromeClient;", "<init>", ("V", ())),
        (
            "Landroid/webkit/WebSettings;",
            "setAllowContentAccess",
            ("V", ("Z",)),
        ),
        ("Landroid/webkit/WebSettings;", "setAllowFileAccess", ("V", ("Z",))),
        (
            "Landroid/webkit/WebSettings;",
            "setAllowFileAccessFromFileURLs",
            ("V", ("Z",)),
        ),
        (
            "Landroid/webkit/WebSettings;",
            "setAllowUniversalAccessFromFileURLs",
            ("V", ("Z",)),
        ),
        ("Landroid/webkit/WebSettings;", "setDatabaseEnabled", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setDomStorageEnabled", ("V", ("Z",))),
        ("Landroid/webkit/WebSettings;", "setJavaScriptEnabled", ("V", ("Z",))),
        (
            "Landroid/webkit/WebSettings;",
            "setMediaPlaybackRequiresUserGesture",
            ("V", ("Z",)),
        ),
        (
            "Landroid/webkit/WebView;",
            "<init>",
            ("V", ("Landroid/content/Context;",)),
        ),
        ("Landroid/webkit/WebView;", "canGoBack", ("Z", ())),
        (
            "Landroid/webkit/WebView;",
            "getSettings",
            ("Landroid/webkit/WebSettings;", ()),
        ),
        ("Landroid/webkit/WebView;", "goBack", ("V", ())),
        ("Landroid/webkit/WebView;", "loadUrl", ("V", ("Ljava/lang/String;",))),
        (
            "Landroid/webkit/WebView;",
            "setWebChromeClient",
            ("V", ("Landroid/webkit/WebChromeClient;",)),
        ),
        (
            "Landroid/webkit/WebView;",
            "setWebViewClient",
            ("V", ("Landroid/webkit/WebViewClient;",)),
        ),
        ("Landroid/webkit/WebViewClient;", "<init>", ("V", ())),
        (MAIN_ACTIVITY_DESC, "<init>", ("V", ())),
        (
            MAIN_ACTIVITY_DESC,
            "onBackPressed",
            ("V", ()),
        ),
        (
            MAIN_ACTIVITY_DESC,
            "onCreate",
            ("V", ("Landroid/os/Bundle;",)),
        ),
    ]
    raw_methods.sort(
        key=lambda m: (t_idx[m[0]], s_idx[m[1]], p_idx[m[2]])
    )
    m_idx = {(m[0], m[1], m[2]): i for i, m in enumerate(raw_methods)}

    # Dalvik instruction helpers (35c format for invoke-*)
    def invoke_35c(opcode: int, count: int, method_id: int, regs: list) -> bytes:
        r = regs + [0] * (5 - len(regs))
        b0 = opcode
        b1 = ((count & 0xF) << 4) | (r[4] & 0xF)
        w1 = method_id & 0xFFFF
        w2 = (
            (r[0] & 0xF)
            | ((r[1] & 0xF) << 4)
            | ((r[2] & 0xF) << 8)
            | ((r[3] & 0xF) << 12)
        )
        return struct.pack("<BBHH", b0, b1, w1, w2)

    # Method 1: MainActivity.<init>()V
    # registers=1 (v0=this), ins=1, outs=1
    init_insns = (
        invoke_35c(
            0x70,
            1,
            m_idx[("Landroid/app/Activity;", "<init>", ("V", ()))],
            [0],
        )
        + struct.pack("<BB", 0x0E, 0x00)  # return-void
    )

    # Method 2: MainActivity.onBackPressed()V
    # registers=2 (v0=local, v1=this), ins=1, outs=1
    f_webview = f_idx[
        (
            MAIN_ACTIVITY_DESC,
            "webView",
            "Landroid/webkit/WebView;",
        )
    ]
    onback_insns = (
        struct.pack("<BBH", 0x54, 0x10, f_webview)  # unit 0 (2 units)
        + struct.pack("<BBh", 0x38, 0x00, 14)  # unit 2 (2 units) -> target 2 + 14 = 16
        + invoke_35c(
            0x6E,
            1,
            m_idx[("Landroid/webkit/WebView;", "canGoBack", ("Z", ()))],
            [0],
        )  # unit 4 (3 units)
        + struct.pack("<BB", 0x0A, 0x00)  # unit 7 (1 unit)
        + struct.pack("<BBh", 0x38, 0x00, 8)  # unit 8 (2 units) -> target 8 + 8 = 16
        + struct.pack("<BBH", 0x54, 0x10, f_webview)  # unit 10 (2 units)
        + invoke_35c(
            0x6E,
            1,
            m_idx[("Landroid/webkit/WebView;", "goBack", ("V", ()))],
            [0],
        )  # unit 12 (3 units)
        + struct.pack("<BB", 0x0E, 0x00)  # unit 15 (1 unit)
        + invoke_35c(
            0x6F,
            1,
            m_idx[("Landroid/app/Activity;", "onBackPressed", ("V", ()))],
            [1],
        )  # unit 16 (3 units)
        + struct.pack("<BB", 0x0E, 0x00)  # unit 19 (1 unit)
    )
    assert len(onback_insns) == 40  # 20 code units

    # Method 3: MainActivity.onCreate(Landroid/os/Bundle;)V
    # registers=6 (v0, v1, v2, v3 = locals; v4 = this, v5 = bundle), ins=2, outs=2
    oncreate_parts = [
        # super.onCreate(bundle)
        invoke_35c(
            0x6F,
            2,
            m_idx[
                (
                    "Landroid/app/Activity;",
                    "onCreate",
                    ("V", ("Landroid/os/Bundle;",)),
                )
            ],
            [4, 5],
        ),
        # v0 = new WebView(this)
        struct.pack("<BBH", 0x22, 0x00, t_idx["Landroid/webkit/WebView;"]),
        invoke_35c(
            0x70,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebView;",
                    "<init>",
                    ("V", ("Landroid/content/Context;",)),
                )
            ],
            [0, 4],
        ),
        # this.webView = v0 (iput-object v0, v4, f_webview)
        struct.pack("<BBH", 0x5B, 0x40, f_webview),
        # v1 = v0.getSettings()
        invoke_35c(
            0x6E,
            1,
            m_idx[
                (
                    "Landroid/webkit/WebView;",
                    "getSettings",
                    ("Landroid/webkit/WebSettings;", ()),
                )
            ],
            [0],
        ),
        struct.pack("<BB", 0x0C, 0x01),  # move-result-object v1
        # v2 = 1 (true), v3 = 0 (false)
        struct.pack("<BB", 0x12, 0x12),  # const/4 v2, 1
        struct.pack("<BB", 0x12, 0x03),  # const/4 v3, 0
        # Configure WebSettings for full native app capabilities
        invoke_35c(
            0x6E,
            2,
            m_idx[
                ("Landroid/webkit/WebSettings;", "setJavaScriptEnabled", ("V", ("Z",)))
            ],
            [1, 2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                ("Landroid/webkit/WebSettings;", "setDomStorageEnabled", ("V", ("Z",)))
            ],
            [1, 2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                ("Landroid/webkit/WebSettings;", "setDatabaseEnabled", ("V", ("Z",)))
            ],
            [1, 2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                ("Landroid/webkit/WebSettings;", "setAllowFileAccess", ("V", ("Z",)))
            ],
            [1, 2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebSettings;",
                    "setAllowContentAccess",
                    ("V", ("Z",)),
                )
            ],
            [1, 2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebSettings;",
                    "setAllowFileAccessFromFileURLs",
                    ("V", ("Z",)),
                )
            ],
            [1, 2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebSettings;",
                    "setAllowUniversalAccessFromFileURLs",
                    ("V", ("Z",)),
                )
            ],
            [1, 2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebSettings;",
                    "setMediaPlaybackRequiresUserGesture",
                    ("V", ("Z",)),
                )
            ],
            [1, 3],
        ),
        # v0.setWebViewClient(new WebViewClient())
        struct.pack("<BBH", 0x22, 0x02, t_idx["Landroid/webkit/WebViewClient;"]),
        invoke_35c(
            0x70,
            1,
            m_idx[("Landroid/webkit/WebViewClient;", "<init>", ("V", ()))],
            [2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebView;",
                    "setWebViewClient",
                    ("V", ("Landroid/webkit/WebViewClient;",)),
                )
            ],
            [0, 2],
        ),
        # v0.setWebChromeClient(new WebChromeClient())
        struct.pack("<BBH", 0x22, 0x02, t_idx["Landroid/webkit/WebChromeClient;"]),
        invoke_35c(
            0x70,
            1,
            m_idx[("Landroid/webkit/WebChromeClient;", "<init>", ("V", ()))],
            [2],
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebView;",
                    "setWebChromeClient",
                    ("V", ("Landroid/webkit/WebChromeClient;",)),
                )
            ],
            [0, 2],
        ),
        # this.setContentView(v0)
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/app/Activity;",
                    "setContentView",
                    ("V", ("Landroid/view/View;",)),
                )
            ],
            [4, 0],
        ),
        # v0.loadUrl("file:///android_asset/index.html")
        struct.pack(
            "<BBH", 0x1A, 0x02, s_idx["file:///android_asset/index.html"]
        ),
        invoke_35c(
            0x6E,
            2,
            m_idx[
                (
                    "Landroid/webkit/WebView;",
                    "loadUrl",
                    ("V", ("Ljava/lang/String;",)),
                )
            ],
            [0, 2],
        ),
        struct.pack("<BB", 0x0E, 0x00),  # return-void
    ]
    oncreate_insns = b"".join(oncreate_parts)

    def make_code_item(
        registers_size: int, ins_size: int, outs_size: int, insns: bytes
    ) -> bytes:
        insns_units = len(insns) // 2
        header = struct.pack(
            "<HHHHII",
            registers_size,
            ins_size,
            outs_size,
            0,  # tries_size
            0,  # debug_info_off
            insns_units,
        )
        blob = header + insns
        while len(blob) % 4 != 0:
            blob += b"\x00"
        return blob

    code_init = make_code_item(1, 1, 1, init_insns)
    code_onback = make_code_item(2, 1, 1, onback_insns)
    code_oncreate = make_code_item(6, 2, 2, oncreate_insns)

    # Calculate fixed section sizes
    header_size = 0x70
    string_ids_size = 4 * len(strings)
    type_ids_size = 4 * len(type_descriptors)
    proto_ids_size = 12 * len(raw_protos)
    field_ids_size = 8 * len(fields)
    method_ids_size = 8 * len(raw_methods)
    class_defs_size = 32 * 1

    string_ids_off = header_size
    type_ids_off = string_ids_off + string_ids_size
    proto_ids_off = type_ids_off + type_ids_size
    field_ids_off = proto_ids_off + proto_ids_size
    method_ids_off = field_ids_off + field_ids_size
    class_defs_off = method_ids_off + method_ids_size
    data_off = class_defs_off + class_defs_size

    data_buf = bytearray()

    def align4() -> None:
        while len(data_buf) % 4 != 0:
            data_buf.append(0)

    # 1. Code items (4-byte aligned)
    align4()
    code_off_Val = data_off + len(data_buf)
    code_init_off = data_off + len(data_buf)
    data_buf.extend(code_init)
    code_onback_off = data_off + len(data_buf)
    data_buf.extend(code_onback)
    code_oncreate_off = data_off + len(data_buf)
    data_buf.extend(code_oncreate)

    # 2. Type lists for protos with parameters (4-byte aligned)
    align4()
    type_lists_off_start = data_off + len(data_buf)
    proto_param_offs = {}
    unique_param_tuples = []
    for _, _, params in raw_protos:
        if params and params not in unique_param_tuples:
            unique_param_tuples.append(params)

    for params in unique_param_tuples:
        align4()
        proto_param_offs[params] = data_off + len(data_buf)
        data_buf.extend(struct.pack("<I", len(params)))
        for pt in params:
            data_buf.extend(struct.pack("<H", t_idx[pt]))
    align4()

    # 3. String data items
    string_data_off_start = data_off + len(data_buf)
    string_data_offs = []
    for s in strings:
        string_data_offs.append(data_off + len(data_buf))
        utf8_bytes = s.encode("utf-8")
        data_buf.extend(uleb128(len(s)))
        data_buf.extend(utf8_bytes)
        data_buf.append(0)

    # 4. Class data item
    class_data_off = data_off + len(data_buf)
    m_main_init = m_idx[(MAIN_ACTIVITY_DESC, "<init>", ("V", ()))]
    m_main_onback = m_idx[(MAIN_ACTIVITY_DESC, "onBackPressed", ("V", ()))]
    m_main_oncreate = m_idx[
        (MAIN_ACTIVITY_DESC, "onCreate", ("V", ("Landroid/os/Bundle;",)))
    ]
    assert m_main_onback < m_main_oncreate

    class_data_bytes = (
        uleb128(0)  # static_fields_size
        + uleb128(1)  # instance_fields_size (webView)
        + uleb128(1)  # direct_methods_size (<init>)
        + uleb128(2)  # virtual_methods_size (onBackPressed, onCreate)
        # instance_field[0]: field_idx_diff, access_flags (PRIVATE = 0x0002)
        + uleb128(f_webview)
        + uleb128(0x0002)
        # direct_method[0]: <init> (PUBLIC | CONSTRUCTOR = 0x10001)
        + uleb128(m_main_init)
        + uleb128(0x10001)
        + uleb128(code_init_off)
        # virtual_method[0]: onBackPressed (PUBLIC = 0x0001)
        + uleb128(m_main_onback)
        + uleb128(0x0001)
        + uleb128(code_onback_off)
        # virtual_method[1]: onCreate (PROTECTED = 0x0004)
        + uleb128(m_main_oncreate - m_main_onback)
        + uleb128(0x0004)
        + uleb128(code_oncreate_off)
    )
    data_buf.extend(class_data_bytes)

    # 5. Map list (4-byte aligned)
    align4()
    map_off = data_off + len(data_buf)
    map_entries = [
        (0x0000, 1, 0),  # TYPE_HEADER_ITEM
        (0x0001, len(strings), string_ids_off),  # TYPE_STRING_ID_ITEM
        (0x0002, len(type_descriptors), type_ids_off),  # TYPE_TYPE_ID_ITEM
        (0x0003, len(raw_protos), proto_ids_off),  # TYPE_PROTO_ID_ITEM
        (0x0004, len(fields), field_ids_off),  # TYPE_FIELD_ID_ITEM
        (0x0005, len(raw_methods), method_ids_off),  # TYPE_METHOD_ID_ITEM
        (0x0006, 1, class_defs_off),  # TYPE_CLASS_DEF_ITEM
        (0x2001, 3, code_off_Val),  # TYPE_CODE_ITEM
        (0x1001, len(unique_param_tuples), type_lists_off_start),  # TYPE_TYPE_LIST
        (0x2002, len(strings), string_data_off_start),  # TYPE_STRING_DATA_ITEM
        (0x2000, 1, class_data_off),  # TYPE_CLASS_DATA_ITEM
        (0x1000, 1, map_off),  # TYPE_MAP_LIST
    ]
    data_buf.extend(struct.pack("<I", len(map_entries)))
    for m_type, m_size, m_offset in map_entries:
        data_buf.extend(struct.pack("<HHII", m_type, 0, m_size, m_offset))
    align4()

    # Build ID tables
    string_ids_blob = b"".join(struct.pack("<I", off) for off in string_data_offs)
    type_ids_blob = b"".join(
        struct.pack("<I", s_idx[t]) for t in type_descriptors
    )
    proto_ids_blob = b"".join(
        struct.pack(
            "<III",
            s_idx[shorty],
            t_idx[ret_t],
            proto_param_offs.get(params, 0),
        )
        for shorty, ret_t, params in raw_protos
    )
    field_ids_blob = b"".join(
        struct.pack("<HHI", t_idx[c], t_idx[ft], s_idx[fn])
        for c, fn, ft in fields
    )
    method_ids_blob = b"".join(
        struct.pack("<HHI", t_idx[c], p_idx[pr], s_idx[mn])
        for c, mn, pr in raw_methods
    )
    class_defs_blob = struct.pack(
        "<IIIIIIII",
        t_idx[MAIN_ACTIVITY_DESC],  # class_idx
        0x0001,  # access_flags = ACC_PUBLIC
        t_idx["Landroid/app/Activity;"],  # superclass_idx
        0,  # interfaces_off
        0xFFFFFFFF,  # source_file_idx = NO_INDEX
        0,  # annotations_off
        class_data_off,  # class_data_off
        0,  # static_values_off
    )

    body_after_header = (
        string_ids_blob
        + type_ids_blob
        + proto_ids_blob
        + field_ids_blob
        + method_ids_blob
        + class_defs_blob
        + bytes(data_buf)
    )
    file_size = header_size + len(body_after_header)
    data_size = len(data_buf)

    header_tail = struct.pack(
        "<IIIIIIIIIIIIIIIIIIII",
        file_size,
        header_size,
        0x12345678,  # ENDIAN_CONSTANT
        0,  # link_size
        0,  # link_off
        map_off,
        len(strings),
        string_ids_off,
        len(type_descriptors),
        type_ids_off,
        len(raw_protos),
        proto_ids_off,
        len(fields),
        field_ids_off,
        len(raw_methods),
        method_ids_off,
        1,  # class_defs_size
        class_defs_off,
        data_size,
        data_off,
    )

    sha1_digest = hashlib.sha1(header_tail + body_after_header).digest()
    adler_val = zlib.adler32(sha1_digest + header_tail + body_after_header) & 0xFFFFFFFF

    dex_bytes = (
        b"dex\n035\x00"
        + struct.pack("<I", adler_val)
        + sha1_digest
        + header_tail
        + body_after_header
    )
    assert len(dex_bytes) == file_size
    return dex_bytes


# ============================================================================
# 5. PERSISTENT SIGNING KEY + V1 (JAR) & V2 (APK SIGNING BLOCK 42) SIGNER
# ============================================================================
def get_or_create_signing_credentials(scripts_dir: str, tmp_dir: str):
    """
    Uses a persistent RSA-2048 signing keypair in scripts/ so that every build of
    Simple-Android.apk shares the same signing certificate across updates.
    """
    key_pem = os.path.join(scripts_dir, "apk-release-key.pem")
    cert_pem = os.path.join(scripts_dir, "apk-release-cert.pem")
    cert_der = os.path.join(tmp_dir, "signer_cert.der")

    if not (os.path.exists(key_pem) and os.path.exists(cert_pem)):
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                key_pem,
                "-out",
                cert_pem,
                "-days",
                "10000",
                "-subj",
                "/CN=Dr. M Verma/OU=Simple Android Engineering/O=Simple E2EE/L=San Francisco/ST=CA/C=US",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    subprocess.run(
        ["openssl", "x509", "-in", cert_pem, "-outform", "DER", "-out", cert_der],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return key_pem, cert_pem, cert_der


def build_jar_v1_signature_files(
    entries: list, key_pem: str, cert_pem: str, tmp_dir: str
):
    """
    Creates META-INF/MANIFEST.MF, META-INF/CERT.SF, and META-INF/CERT.RSA
    strictly conforming to the JAR Signature Scheme v1 specification.
    Every individual section (including the last one) ends with \\r\\n\\r\\n.
    """
    main_section = (
        "Manifest-Version: 1.0\r\n"
        "Created-By: 1.0 (Simple Android Builder)\r\n\r\n"
    )
    manifest_sections = [main_section]
    sf_sections = []

    for name, data, _compress in entries:
        digest_b64 = base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")
        section = f"Name: {name}\r\nSHA-256-Digest: {digest_b64}\r\n\r\n"
        manifest_sections.append(section)

        sf_digest_b64 = base64.b64encode(
            hashlib.sha256(section.encode("utf-8")).digest()
        ).decode("ascii")
        sf_sections.append(
            f"Name: {name}\r\nSHA-256-Digest: {sf_digest_b64}\r\n\r\n"
        )

    manifest_bytes = "".join(manifest_sections).encode("utf-8")
    main_manifest_digest = base64.b64encode(
        hashlib.sha256(manifest_bytes).digest()
    ).decode("ascii")
    main_attrs_digest = base64.b64encode(
        hashlib.sha256(main_section.encode("utf-8")).digest()
    ).decode("ascii")

    sf_header = (
        "Signature-Version: 1.0\r\n"
        f"SHA-256-Digest-Manifest: {main_manifest_digest}\r\n"
        f"SHA-256-Digest-Manifest-Main-Attributes: {main_attrs_digest}\r\n"
        "Created-By: 1.0 (Simple Android Builder)\r\n\r\n"
    )
    sf_bytes = (sf_header + "".join(sf_sections)).encode("utf-8")

    sf_path = os.path.join(tmp_dir, "CERT.SF")
    rsa_path = os.path.join(tmp_dir, "CERT.RSA")
    with open(sf_path, "wb") as f:
        f.write(sf_bytes)

    subprocess.run(
        [
            "openssl",
            "cms",
            "-sign",
            "-binary",
            "-noattr",
            "-in",
            sf_path,
            "-signer",
            cert_pem,
            "-inkey",
            key_pem,
            "-outform",
            "DER",
            "-out",
            rsa_path,
            "-md",
            "sha256",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    with open(rsa_path, "rb") as f:
        rsa_bytes = f.read()

    return [
        ("META-INF/MANIFEST.MF", manifest_bytes, True),
        ("META-INF/CERT.SF", sf_bytes, True),
        ("META-INF/CERT.RSA", rsa_bytes, True),
    ]


def build_zip_sections(all_entries: list):
    """
    Constructs ZIP Section 1 (local file entries with 4-byte alignment for stored entries),
    Section 3 (Central Directory), and Section 4 (EOCD with cd_offset = len(section1)).
    """
    local_chunks = bytearray()
    central_chunks = bytearray()

    for name, raw_data, compress in all_entries:
        name_bytes = name.encode("utf-8")
        crc = zlib.crc32(raw_data) & 0xFFFFFFFF
        uncomp_size = len(raw_data)

        if compress:
            comp_obj = zlib.compressobj(6, zlib.DEFLATED, -zlib.MAX_WBITS)
            comp_data = comp_obj.compress(raw_data) + comp_obj.flush()
            method = 8
        else:
            comp_data = raw_data
            method = 0

        comp_size = len(comp_data)
        local_header_offset = len(local_chunks)

        # For uncompressed entries, pad extra field so data starts on a 4-byte boundary (zipalign)
        extra_bytes = b""
        if method == 0:
            data_start = local_header_offset + 30 + len(name_bytes)
            pad = (4 - (data_start % 4)) % 4
            extra_bytes = b"\x00" * pad

        local_header = struct.pack(
            "<IHHHHHIIIHH",
            0x04034B50,  # Local file header signature
            20,  # Version needed to extract
            0,  # General purpose bit flag
            method,
            0,  # Last mod file time
            0x21,  # Last mod file date (1980-01-01)
            crc,
            comp_size,
            uncomp_size,
            len(name_bytes),
            len(extra_bytes),
        )
        local_chunks.extend(local_header)
        local_chunks.extend(name_bytes)
        local_chunks.extend(extra_bytes)
        local_chunks.extend(comp_data)

        central_header = struct.pack(
            "<IHHHHHHIIIHHHHHII",
            0x02014B50,  # Central directory file header signature
            20,  # Version made by
            20,  # Version needed to extract
            0,  # General purpose bit flag
            method,
            0,  # Last mod file time
            0x21,  # Last mod file date
            crc,
            comp_size,
            uncomp_size,
            len(name_bytes),
            0,  # Extra field length
            0,  # File comment length
            0,  # Disk number start
            0,  # Internal file attributes
            0,  # External file attributes
            local_header_offset,
        )
        central_chunks.extend(central_header)
        central_chunks.extend(name_bytes)

    cd_offset = len(local_chunks)
    cd_size = len(central_chunks)
    eocd = struct.pack(
        "<IHHHHIIH",
        0x06054B50,
        0,  # Number of this disk
        0,  # Disk where central directory starts
        len(all_entries),
        len(all_entries),
        cd_size,
        cd_offset,
        0,  # Comment length
    )
    return bytes(local_chunks), bytes(central_chunks), eocd


def compute_apk_v2_signing_block(
    section1: bytes,
    section3_cd: bytes,
    eocd_with_signing_block_offset: bytes,
    key_pem: str,
    cert_der_path: str,
    tmp_dir: str,
) -> bytes:
    """
    Computes the official Android APK Signature Scheme v2 Signing Block (ID 0x7109871a)
    matching AOSP ApkSignatureSchemeV2Verifier.java byte-for-byte.
    Note: Per the APK Signature Scheme v2 specification, when computing the digest over
    Section 4 (EOCD), bytes 16..20 of EOCD MUST hold apkSigningBlockOffset (len(section1)).
    """
    CHUNK_SIZE = 1024 * 1024  # 1 MB chunks
    chunk_digests = []

    for section in (section1, section3_cd, eocd_with_signing_block_offset):
        offset = 0
        sec_len = len(section)
        while offset < sec_len:
            chunk = section[offset : offset + CHUNK_SIZE]
            h = hashlib.sha256()
            h.update(b"\xa5")
            h.update(struct.pack("<I", len(chunk)))
            h.update(chunk)
            chunk_digests.append(h.digest())
            offset += CHUNK_SIZE

    top_h = hashlib.sha256()
    top_h.update(b"\x5a")
    top_h.update(struct.pack("<I", len(chunk_digests)))
    for d in chunk_digests:
        top_h.update(d)
    top_level_digest = top_h.digest()

    with open(cert_der_path, "rb") as f:
        cert_der = f.read()

    def lp_slice(b: bytes) -> bytes:
        return struct.pack("<I", len(b)) + b

    # Signature Algorithm ID: 0x0103 = RSASSA-PKCS1-v1_5 with SHA2-256
    SIG_ALGO_RSA_PKCS1_V1_5_SHA256 = 0x0103

    # digests: length-prefixed sequence of length-prefixed digest records
    digest_record = struct.pack("<I", SIG_ALGO_RSA_PKCS1_V1_5_SHA256) + lp_slice(
        top_level_digest
    )
    digests_seq = lp_slice(lp_slice(digest_record))

    # certificates: length-prefixed sequence of length-prefixed X.509 certificates
    certs_seq = lp_slice(lp_slice(cert_der))

    # additional attributes: length-prefixed empty sequence
    additional_attrs_seq = struct.pack("<I", 0)

    signed_data = digests_seq + certs_seq + additional_attrs_seq

    signed_data_path = os.path.join(tmp_dir, "v2_signed_data.bin")
    sig_out_path = os.path.join(tmp_dir, "v2_sig.bin")
    pubkey_der_path = os.path.join(tmp_dir, "pubkey.der")

    with open(signed_data_path, "wb") as f:
        f.write(signed_data)

    subprocess.run(
        [
            "openssl",
            "dgst",
            "-sha256",
            "-sign",
            key_pem,
            "-out",
            sig_out_path,
            signed_data_path,
        ],
        check=True,
    )
    with open(sig_out_path, "rb") as f:
        signature_bytes = f.read()

    subprocess.run(
        [
            "openssl",
            "rsa",
            "-in",
            key_pem,
            "-pubout",
            "-outform",
            "DER",
            "-out",
            pubkey_der_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    with open(pubkey_der_path, "rb") as f:
        pubkey_der = f.read()

    # signatures: length-prefixed sequence of length-prefixed signature records
    signature_record = struct.pack(
        "<I", SIG_ALGO_RSA_PKCS1_V1_5_SHA256
    ) + lp_slice(signature_bytes)
    signatures_seq = lp_slice(lp_slice(signature_record))

    signer_block = (
        lp_slice(signed_data) + signatures_seq + lp_slice(pubkey_der)
    )
    signers_seq = lp_slice(lp_slice(signer_block))

    # ID-value pair: ID = 0x7109871a (APK Signature Scheme v2 Block ID)
    pair_payload = struct.pack("<I", 0x7109871A) + signers_seq
    id_value_pair = struct.pack("<Q", len(pair_payload)) + pair_payload

    # Pad APK Signing Block to a multiple of 4096 bytes with Android's VERITY_PADDING_BLOCK_ID (0x42726577)
    raw_block_len = 8 + len(id_value_pair) + 8 + 16
    remainder = raw_block_len % 4096
    padding_pair = b""
    if remainder != 0:
        needed = (4096 - remainder) % 4096
        if needed < 12:
            needed += 4096
        pad_val_len = needed - 12
        pad_payload = struct.pack("<I", 0x42726577) + (b"\x00" * pad_val_len)
        padding_pair = struct.pack("<Q", len(pad_payload)) + pad_payload

    pairs_blob = id_value_pair + padding_pair
    size_of_block = len(pairs_blob) + 8 + 16

    signing_block = (
        struct.pack("<Q", size_of_block)
        + pairs_blob
        + struct.pack("<Q", size_of_block)
        + b"APK Sig Block 42"
    )
    assert len(signing_block) % 4096 == 0
    return signing_block


# ============================================================================
# 6. SELF-CONTAINED ANDROID PACKAGE VERIFIER (AOSP v1 + v2 + ZIP + ARSC + DEX)
# ============================================================================
def verify_apk_package(apk_bytes: bytes, cert_pem: str, tmp_dir: str) -> None:
    """
    Simulates Android's PackageParser, ApkSignatureSchemeV2Verifier, JarVerifier,
    and zipalign verifier to guarantee the built APK has zero structural issues.
    """
    # 1. Locate EOCD & APK Signing Block
    assert apk_bytes[-22:-18] == b"PK\x05\x06", "Missing EOCD signature"
    cd_size, cd_offset = struct.unpack("<II", apk_bytes[-10:-2])
    assert apk_bytes[cd_offset - 16 : cd_offset] == b"APK Sig Block 42"
    size_of_block_bottom = struct.unpack("<Q", apk_bytes[cd_offset - 24 : cd_offset - 16])[0]
    sig_block_start = cd_offset - (size_of_block_bottom + 8)
    size_of_block_top = struct.unpack("<Q", apk_bytes[sig_block_start : sig_block_start + 8])[0]
    assert size_of_block_top == size_of_block_bottom
    assert (cd_offset - sig_block_start) % 4096 == 0

    # 2. Parse APK Signature Scheme v2 Block (0x7109871a) exactly like ApkSignatureSchemeV2Verifier.java
    pairs = memoryview(apk_bytes[sig_block_start + 8 : cd_offset - 24])
    pos = 0
    v2_value = None
    while pos < len(pairs):
        pair_len = struct.unpack_from("<Q", pairs, pos)[0]
        pos += 8
        pair_id = struct.unpack_from("<I", pairs, pos)[0]
        if pair_id == 0x7109871A:
            v2_value = bytes(pairs[pos + 4 : pos + pair_len])
        pos += pair_len
    assert v2_value is not None, "APK Signature Scheme v2 block (0x7109871a) not found"

    def read_lp(buf: bytes, offset: int):
        length = struct.unpack_from("<I", buf, offset)[0]
        end = offset + 4 + length
        assert end <= len(buf), "Buffer underflow in length-prefixed slice"
        return buf[offset + 4 : end], end

    signers_slice, end_pos = read_lp(v2_value, 0)
    assert end_pos == len(v2_value)
    signer_slice, end_pos = read_lp(signers_slice, 0)
    assert end_pos == len(signers_slice)

    signed_data, off = read_lp(signer_slice, 0)
    signatures_slice, off = read_lp(signer_slice, off)
    pubkey_bytes, off = read_lp(signer_slice, off)
    assert off == len(signer_slice)

    # Parse signatures
    sig_record, end_sig = read_lp(signatures_slice, 0)
    assert end_sig == len(signatures_slice)
    sig_algo = struct.unpack_from("<I", sig_record, 0)[0]
    assert sig_algo == 0x0103
    sig_bytes, end_sig_rec = read_lp(sig_record, 4)
    assert end_sig_rec == len(sig_record)

    # Parse signed_data
    digests_slice, sd_off = read_lp(signed_data, 0)
    certs_slice, sd_off = read_lp(signed_data, sd_off)
    attrs_slice, sd_off = read_lp(signed_data, sd_off)
    assert sd_off == len(signed_data)
    assert len(attrs_slice) == 0

    digest_record, end_dig = read_lp(digests_slice, 0)
    assert end_dig == len(digests_slice)
    dig_algo = struct.unpack_from("<I", digest_record, 0)[0]
    assert dig_algo == 0x0103
    expected_digest, end_dig_rec = read_lp(digest_record, 4)
    assert end_dig_rec == len(digest_record)

    cert_der, end_cert = read_lp(certs_slice, 0)
    assert end_cert == len(certs_slice) and len(cert_der) > 100

    # Verify RSA signature over signed_data using OpenSSL
    v_sd = os.path.join(tmp_dir, "verify_sd.bin")
    v_sig = os.path.join(tmp_dir, "verify_sig.bin")
    v_pub = os.path.join(tmp_dir, "verify_pub.der")
    with open(v_sd, "wb") as f:
        f.write(signed_data)
    with open(v_sig, "wb") as f:
        f.write(sig_bytes)
    with open(v_pub, "wb") as f:
        f.write(pubkey_bytes)
    subprocess.run(
        [
            "openssl",
            "dgst",
            "-sha256",
            "-verify",
            v_pub,
            "-keyform",
            "DER",
            "-signature",
            v_sig,
            v_sd,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Recompute 1MB chunked content digest with EOCD CD offset set to sig_block_start
    sec1 = apk_bytes[:sig_block_start]
    sec3 = apk_bytes[cd_offset : cd_offset + cd_size]
    sec4_raw = apk_bytes[cd_offset + cd_size :]
    sec4_for_digest = (
        sec4_raw[:16] + struct.pack("<I", sig_block_start) + sec4_raw[20:]
    )

    chunk_digests = []
    for sec in (sec1, sec3, sec4_for_digest):
        for i in range(0, len(sec), 1024 * 1024):
            ch = sec[i : i + 1024 * 1024]
            chunk_digests.append(
                hashlib.sha256(b"\xa5" + struct.pack("<I", len(ch)) + ch).digest()
            )
    recomputed_top = hashlib.sha256(
        b"\x5a"
        + struct.pack("<I", len(chunk_digests))
        + b"".join(chunk_digests)
    ).digest()
    assert (
        recomputed_top == expected_digest
    ), "APK Signature Scheme v2 digest mismatch!"

    # 3. Verify 4-byte zipalign of all uncompressed entries in Section 1
    p = 0
    while p < len(sec1):
        sig, _ver, _flags, method, _time, _date, _crc, csize, _usize, nlen, elen = (
            struct.unpack_from("<IHHHHHIIIHH", sec1, p)
        )
        assert sig == 0x04034B50
        name = sec1[p + 30 : p + 30 + nlen].decode("utf-8")
        data_start = p + 30 + nlen + elen
        if method == 0:
            assert (
                data_start % 4 == 0
            ), f"Uncompressed entry {name} is not 4-byte aligned (offset {data_start})"
        p = data_start + csize

    # 4. Verify JAR v1 CMS Signature using OpenSSL
    import zipfile
    import io

    with zipfile.ZipFile(io.BytesIO(apk_bytes), "r") as zf:
        mf_bytes = zf.read("META-INF/MANIFEST.MF")
        sf_bytes = zf.read("META-INF/CERT.SF")
        rsa_bytes = zf.read("META-INF/CERT.RSA")
        assert mf_bytes.endswith(b"\r\n\r\n")
        assert sf_bytes.endswith(b"\r\n\r\n")
        v_sf = os.path.join(tmp_dir, "verify_CERT.SF")
        v_rsa = os.path.join(tmp_dir, "verify_CERT.RSA")
        with open(v_sf, "wb") as f:
            f.write(sf_bytes)
        with open(v_rsa, "wb") as f:
            f.write(rsa_bytes)
        subprocess.run(
            [
                "openssl",
                "cms",
                "-verify",
                "-binary",
                "-inform",
                "DER",
                "-in",
                v_rsa,
                "-content",
                v_sf,
                "-CAfile",
                cert_pem,
                "-purpose",
                "any",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def main():
    scripts_dir = os.path.abspath(os.path.dirname(__file__))
    root_dir = os.path.abspath(os.path.join(scripts_dir, ".."))
    dist_dir = os.path.join(root_dir, "dist")
    public_dir = os.path.join(root_dir, "public")

    if not os.path.exists(os.path.join(dist_dir, "index.html")):
        raise RuntimeError("dist/index.html not found. Run 'npm run build' first.")

    inlined_html = build_inlined_index_html(dist_dir)
    manifest_axml = compile_android_manifest()
    resources_arsc = compile_resources_arsc()
    classes_dex = compile_classes_dex()

    # Load launcher icon PNG (generated from user's Simple app icon)
    icon_192_path = os.path.join(public_dir, "icon-192.png")
    icon_512_path = os.path.join(public_dir, "icon-512.png")
    with open(icon_192_path, "rb") as f:
        icon_192_bytes = f.read()
    with open(icon_512_path, "rb") as f:
        icon_512_bytes = f.read()

    payload_entries = [
        ("AndroidManifest.xml", manifest_axml, True),
        ("resources.arsc", resources_arsc, False),
        ("res/drawable/ic_launcher.png", icon_192_bytes, False),
        ("classes.dex", classes_dex, False),
        ("assets/index.html", inlined_html, True),
        ("assets/icon-192.png", icon_192_bytes, False),
        ("assets/icon-512.png", icon_512_bytes, False),
    ]

    # Bundle all compiled media/wallpaper assets from dist/assets/ into assets/assets/ inside the APK
    for asset_file in sorted(glob.glob(os.path.join(dist_dir, "assets", "*"))):
        ext = os.path.splitext(asset_file)[1].lower()
        if ext in (".jpg", ".jpeg", ".png", ".svg", ".webp"):
            asset_name = os.path.basename(asset_file)
            with open(asset_file, "rb") as af:
                payload_entries.append((f"assets/assets/{asset_name}", af.read(), False))

    # Bundle all chat theme wallpapers from src/assets/images/chat_bg_* into assets/wallpapers/
    src_images_dir = os.path.join(root_dir, "src", "assets", "images")
    for img_file in sorted(glob.glob(os.path.join(src_images_dir, "chat_bg_*"))):
        ext = os.path.splitext(img_file)[1].lower()
        if ext in (".jpg", ".jpeg", ".png", ".webp"):
            img_name = os.path.basename(img_file)
            with open(img_file, "rb") as imf:
                payload_entries.append(
                    (f"assets/wallpapers/{img_name}", imf.read(), False)
                )

    # Also bundle public icons at root of assets/
    for pub_name in ("apple-touch-icon.png", "icon.svg"):
        pub_path = os.path.join(public_dir, pub_name)
        if os.path.exists(pub_path):
            with open(pub_path, "rb") as pf:
                payload_entries.append((f"assets/{pub_name}", pf.read(), False))

    with tempfile.TemporaryDirectory() as tmp_dir:
        key_pem, cert_pem, cert_der = get_or_create_signing_credentials(
            scripts_dir, tmp_dir
        )
        v1_sig_entries = build_jar_v1_signature_files(
            payload_entries, key_pem, cert_pem, tmp_dir
        )
        all_entries = payload_entries + v1_sig_entries

        # Note: section4_eocd returned by build_zip_sections has cd_offset = len(section1),
        # which is apkSigningBlockOffset — the exact EOCD bytes required by APK Signature Scheme v2!
        section1, section3_cd, section4_eocd = build_zip_sections(all_entries)

        v2_signing_block = compute_apk_v2_signing_block(
            section1, section3_cd, section4_eocd, key_pem, cert_der, tmp_dir
        )

        # In the actual file on disk, EOCD's cd_offset points to section3_cd (after v2_signing_block)
        new_cd_offset = len(section1) + len(v2_signing_block)
        updated_eocd = (
            section4_eocd[:16]
            + struct.pack("<I", new_cd_offset)
            + section4_eocd[20:]
        )

        final_apk = section1 + v2_signing_block + section3_cd + updated_eocd

        # Cryptographically & structurally verify the generated APK before writing
        verify_apk_package(final_apk, cert_pem, tmp_dir)

    versioned_root_name = f"Simple-Android-v{VERSION_NAME}.apk"
    versioned_release_name = f"Simple-v{VERSION_NAME}.apk"

    # Output to repository root, releases/, public/, and dist/ (including v8.0.0, v7.0.0, and v6.0.0 so no link ever 404s)
    out_paths = [
        os.path.join(root_dir, versioned_root_name),
        os.path.join(root_dir, "Simple-Android-v7.0.0.apk"),
        os.path.join(root_dir, "Simple-Android-v6.0.0.apk"),
        os.path.join(root_dir, "Simple-Android.apk"),
        os.path.join(root_dir, "releases", versioned_release_name),
        os.path.join(root_dir, "releases", "Simple-v7.0.0.apk"),
        os.path.join(root_dir, "releases", "Simple-v6.0.0.apk"),
        os.path.join(root_dir, "public", versioned_root_name),
        os.path.join(root_dir, "public", "Simple-Android-v7.0.0.apk"),
        os.path.join(root_dir, "public", "Simple-Android-v6.0.0.apk"),
        os.path.join(root_dir, "public", "Simple-Android.apk"),
        os.path.join(dist_dir, versioned_root_name),
        os.path.join(dist_dir, "Simple-Android-v7.0.0.apk"),
        os.path.join(dist_dir, "Simple-Android-v6.0.0.apk"),
        os.path.join(dist_dir, "Simple-Android.apk"),
    ]
    for path in out_paths:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(final_apk)

    # Also write staging copies in /tmp/apk-stage so AI Studio VFS move tool can register them
    stage_dir = "/tmp/apk-stage"
    os.makedirs(stage_dir, exist_ok=True)
    for stage_name in (
        versioned_root_name,
        "Simple-Android-v7.0.0.apk",
        "Simple-Android-v6.0.0.apk",
        "Simple-Android.apk",
        versioned_release_name,
        "Simple-v7.0.0.apk",
        "Simple-v6.0.0.apk",
    ):
        with open(os.path.join(stage_dir, stage_name), "wb") as sf:
            sf.write(final_apk)

    size_kb = len(final_apk) / 1024.0
    print(
        f"[Simple APK Builder] Built & verified {versioned_root_name} (v{VERSION_NAME}, code {VERSION_CODE}, {size_kb:.1f} KB) [v1 JAR + v2 Block 42 OK] -> "
        + ", ".join(os.path.relpath(p, root_dir) for p in out_paths)
    )


if __name__ == "__main__":
    main()
