#!/usr/bin/env python3
"""
Upload GBA covers to Cloudflare R2 using boto3
"""

import os
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
import time
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configuration
BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "picocover")
PREFIX = os.getenv("CLOUDFLARE_R2_PREFIX", "gba")
REGION = "auto"
MAX_WORKERS = 5
MAX_RETRIES = 3

# Get credentials from environment
ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
ACCESS_KEY = os.getenv("CLOUDFLARE_R2_ACCESS_KEY")
SECRET_KEY = os.getenv("CLOUDFLARE_R2_SECRET_KEY")

if not all([ACCOUNT_ID, ACCESS_KEY, SECRET_KEY]):
    print("ERROR: Missing Cloudflare credentials")
    print("Set: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY, CLOUDFLARE_R2_SECRET_KEY")
    sys.exit(1)

# Initialize R2 client
s3_client = boto3.client(
    "s3",
    endpoint_url=f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name=REGION,
    config=Config(signature_version="s3v4", retries={"max_attempts": MAX_RETRIES})
)

# Thread-safe counters
counter_lock = Lock()
success_count = 0
fail_count = 0

def upload_file(file_path, index, total):
    """Upload a single file to R2 with retries"""
    global success_count, fail_count
    
    file_name = file_path.name
    r2_path = f"{PREFIX}/{file_name}" if PREFIX else file_name
    
    for attempt in range(1, MAX_RETRIES + 1):
        print(f"[{index}/{total}] {r2_path}", end=" ", flush=True)
        
        try:
            s3_client.upload_file(str(file_path), BUCKET_NAME, r2_path)
            print("✓")
            with counter_lock:
                success_count += 1
            return
        except ClientError as e:
            if attempt < MAX_RETRIES:
                print(f"(retry {attempt}/{MAX_RETRIES})", end=" ", flush=True)
                time.sleep(1)
            else:
                print("✗")
                with counter_lock:
                    fail_count += 1
                print(f"  Error: {str(e)[:100]}")
                return
        except Exception as e:
            if attempt < MAX_RETRIES:
                print(f"(retry {attempt}/{MAX_RETRIES})", end=" ", flush=True)
                time.sleep(1)
            else:
                print("✗")
                with counter_lock:
                    fail_count += 1
                print(f"  Error: {str(e)[:100]}")
                return

# Get all files to upload
covers_dir = Path("covers_renamed")
if not covers_dir.exists():
    print(f"ERROR: Directory {covers_dir} not found")
    sys.exit(1)

files = sorted([f for f in covers_dir.glob("*.*") if f.is_file()])
total = len(files)

if total == 0:
    print(f"ERROR: No files found in {covers_dir}")
    sys.exit(1)

print(f"Starting upload to R2 bucket: {BUCKET_NAME}")
print(f"Source directory: {covers_dir}")
print(f"Prefix: {PREFIX}")
print(f"Found {total} files to upload")
print(f"Workers: {MAX_WORKERS}, Retries: {MAX_RETRIES}\n")

try:
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(upload_file, file_path, i + 1, total): i
            for i, file_path in enumerate(files)
        }
        
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                print(f"Worker error: {e}")
    
    print(f"\n{'='*60}")
    print(f"Upload complete!")
    print(f"Total files: {total}")
    print(f"Successful: {success_count}")
    print(f"Failed: {fail_count}")
    print(f"{'='*60}")
    
    sys.exit(0 if fail_count == 0 else 1)

except KeyboardInterrupt:
    print("\n\nUpload cancelled by user")
    sys.exit(1)
except Exception as e:
    print(f"\n\nERROR: {e}")
    sys.exit(1)
