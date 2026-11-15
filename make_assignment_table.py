"""本実験の割当表を生成する（6セルの並べ替えブロック）。
シードと長さを固定し、生成した表を assignment_table.js に書き出す。
DataPipe の条件数は TABLE_LEN と同じ値に設定すること。"""
import random, json, sys
SEED = 20261013
N_BLOCKS = 60            # 60ブロック × 6セル = 360行（割当後の離脱を見込んで300より多め）
rng = random.Random(SEED)
table = []
for _ in range(N_BLOCKS):
    block = list(range(6))
    rng.shuffle(block)
    table += block
out = sys.argv[1] if len(sys.argv) > 1 else 'assignment_table.js'
with open(out, 'w', encoding='utf-8') as f:
    f.write('/* 自動生成：make_assignment_table.py（SEED=%d, %dブロック×6セル=%d行）。手で編集しないこと */\n' % (SEED, N_BLOCKS, len(table)))
    f.write('window.ASSIGNMENT_TABLE = Object.freeze({ seed: %d, blockSize: 6, cells: %s });\n' % (SEED, json.dumps(table)))
print(len(table), table[:12])
