#!/usr/bin/env python3
"""Upload music files to Cloudflare R2"""
import boto3
import os
import sys

# R2 credentials
# ⚠️ 2026-08-31 安全修正:此处原先写死的密钥曾随 PUBLIC 仓库(commit 146a721)泄露,已移除。
#    请改从环境变量读取,不要把任何密钥再写进仓库:
#       R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY
#    注意:仅删除文件无效——提交历史已被公开克隆,必须在 Cloudflare 后台吊销并轮换那对密钥。
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
if not (R2_ENDPOINT and R2_ACCESS_KEY and R2_SECRET_KEY):
    print("缺少 R2 凭据:请先设置环境变量 R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY")
    sys.exit(1)

s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto"
)

# Step 1: List buckets
print("=== Listing buckets ===")
try:
    resp = s3.list_buckets()
    for b in resp.get("Buckets", []):
        print(f"  Bucket: {b['Name']}")
except Exception as e:
    print(f"Error listing buckets: {e}")
    sys.exit(1)

# Step 2: Check which bucket has cdn.cloudbear.cloud content
# Try common bucket names
bucket_candidates = ["cdn", "cloudbear", "cloudbear-cdn", "gallery", "music", "dream-gallery"]
found_bucket = None

for name in bucket_candidates:
    try:
        s3.head_bucket(Bucket=name)
        print(f"\n  Found bucket: {name}")
        found_bucket = name
        break
    except:
        pass

if not found_bucket:
    # Try listing objects in the first bucket
    if resp.get("Buckets"):
        found_bucket = resp["Buckets"][0]["Name"]
        print(f"\n  Using first bucket: {found_bucket}")

if not found_bucket:
    print("No bucket found!")
    sys.exit(1)

# Step 3: List existing objects in the bucket
print(f"\n=== Objects in '{found_bucket}' ===")
try:
    objs = s3.list_objects_v2(Bucket=found_bucket, MaxKeys=50)
    for obj in objs.get("Contents", []):
        print(f"  {obj['Key']} ({obj['Size']} bytes)")
except Exception as e:
    print(f"Error listing objects: {e}")

# Step 4: Upload music files
dist_music = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "music")
if not os.path.exists(dist_music):
    print(f"\nMusic dir not found: {dist_music}")
    sys.exit(1)

print(f"\n=== Uploading music files from {dist_music} ===")
for fname in os.listdir(dist_music):
    if fname.endswith(".m4a"):
        local_path = os.path.join(dist_music, fname)
        key = f"music/{fname}"
        print(f"  Uploading {fname} -> {key} ...")
        try:
            s3.upload_file(local_path, found_bucket, key, ExtraArgs={
                "ContentType": "audio/mp4",
                "CacheControl": "no-cache, no-store, must-revalidate"
            })
            print(f"    OK ({os.path.getsize(local_path)} bytes)")
        except Exception as e:
            print(f"    FAILED: {e}")

print("\n=== Done! ===")
