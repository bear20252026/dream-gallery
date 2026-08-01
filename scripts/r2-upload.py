#!/usr/bin/env python3
"""Upload music files to Cloudflare R2"""
import boto3
import os
import sys

# R2 credentials
R2_ENDPOINT = "https://52eab2ceafe4c07d54bdea60443ad115.r2.cloudflarestorage.com"
R2_ACCESS_KEY = "e486f9216a06e21e4f06aa74d5ee366e"
R2_SECRET_KEY = "47fb5b8e41fedc061ce88814a3e8289843fe224edacb47ed116ec29ee1dc7fbc"

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
