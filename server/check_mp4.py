#!/usr/bin/env python3
"""检查MP4文件结构"""

import struct
import os

def check_mp4_structure(filename):
    """检查MP4文件的原子结构"""
    with open(filename, 'rb') as f:
        data = f.read(2000)  # 读取前2KB
        
        moov_pos = data.find(b'moov')
        mdat_pos = data.find(b'mdat')
        ftyp_pos = data.find(b'ftyp')
        
        print(f"文件: {filename}")
        print(f"文件大小: {os.path.getsize(filename)} bytes")
        print(f"ftyp atom位置: {ftyp_pos}")
        print(f"moov atom位置: {moov_pos}")
        print(f"mdat atom位置: {mdat_pos}")
        
        if moov_pos != -1 and mdat_pos != -1:
            print(f"moov在mdat前面: {moov_pos < mdat_pos}")
            if moov_pos > mdat_pos:
                print("⚠️  警告: moov atom在mdat后面，可能影响流式播放")
        
        # 检查文件头
        print(f"文件前32字节: {data[:32].hex()}")
        
        # 检查是否有标准的MP4签名
        if data[4:8] == b'ftyp':
            brand = data[8:12]
            print(f"文件品牌: {brand}")
        
        return moov_pos, mdat_pos

if __name__ == "__main__":
    filename = "David Garrett - A. Vivaldi's ＂Four Seasons＂ Spring, Summer, Autumn, Winter - Masha (720p, h264).mp4"
    check_mp4_structure(filename)