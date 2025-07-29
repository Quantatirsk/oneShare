#!/usr/bin/env python3
"""扩展检查MP4文件结构"""

import struct
import os

def find_atoms(filename, max_read=50000):
    """查找MP4文件中的关键原子位置"""
    with open(filename, 'rb') as f:
        data = f.read(max_read)
        
        atoms = {}
        atoms['ftyp'] = data.find(b'ftyp')
        atoms['moov'] = data.find(b'moov')
        atoms['mdat'] = data.find(b'mdat')
        atoms['mvhd'] = data.find(b'mvhd')
        
        print(f"文件: {filename}")
        print(f"文件大小: {os.path.getsize(filename)} bytes")
        print("原子位置:")
        for atom, pos in atoms.items():
            if pos != -1:
                print(f"  {atom}: {pos}")
            else:
                print(f"  {atom}: 未在前{max_read}字节中找到")
        
        # 如果mdat未找到，搜索更大范围
        if atoms['mdat'] == -1:
            f.seek(0)
            chunk_size = 1024 * 1024  # 1MB chunks
            offset = 0
            found = False
            
            while offset < os.path.getsize(filename) and not found:
                f.seek(offset)
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                    
                mdat_pos = chunk.find(b'mdat')
                if mdat_pos != -1:
                    print(f"  mdat: {offset + mdat_pos} (在文件的第{offset + mdat_pos}字节)")
                    found = True
                    break
                    
                offset += chunk_size - 4  # 重叠4字节避免跨边界的atom
        
        return atoms

if __name__ == "__main__":
    filename = "David Garrett - A. Vivaldi's ＂Four Seasons＂ Spring, Summer, Autumn, Winter - Masha (720p, h264).mp4"
    find_atoms(filename)