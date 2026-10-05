window.ER = window.ER || {};
(function (ER) {
'use strict';

function cellText(cell) {
    return cell ? cell.textContent.trim() : '';
}

function maxColumnCount(table) {
    return Array.from(table.rows).reduce((max, row) => {
        return Math.max(max, row.cells.length);
    }, 0);
}

function headerCells(table) {
    if (table.tHead && table.tHead.rows.length > 0) {
        const ths = table.tHead.querySelectorAll('th');
        if (ths.length > 0) {
            return Array.from(ths);
        }
        return Array.from(table.tHead.rows[0].cells);
    }

    const firstRow = table.rows[0];
    if (!firstRow) {
        return [];
    }
    return Array.from(firstRow.cells);
}

function bodyRows(table) {
    if (table.tHead && table.tHead.rows.length > 0) {
        return Array.from(table.tBodies).flatMap((body) => Array.from(body.rows));
    }
    return Array.from(table.rows).slice(1);
}

function bodyCellCount(rows) {
    return rows.reduce((count, row) => count + row.cells.length, 0);
}

function shouldUseCardTitle(headers, row) {
    const firstHeaderBlank = !headers[0];
    const firstCell = row.cells[0];
    const firstCellIsTh = firstCell && firstCell.tagName === 'TH';
    return firstHeaderBlank || firstCellIsTh;
}

function appendCardRow(card, label, value) {
    if (!value) {
        return;
    }

    const line = document.createElement('p');
    line.className = 'table-card-row';

    if (label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'table-card-label';
        labelEl.textContent = label + ': ';
        line.appendChild(labelEl);
        line.appendChild(document.createTextNode(value));
    } else {
        line.textContent = value;
    }

    card.appendChild(line);
}

function flattenTable(table) {
    if (maxColumnCount(table) < 2) {
        return;
    }

    const headerEls = headerCells(table);
    const headers = headerEls.map(cellText);
    const rows = bodyRows(table);

    if (rows.length === 0 || bodyCellCount(rows) <= 1) {
        return;
    }

    const stack = document.createElement('div');
    stack.className = 'table-stack';

    rows.forEach((row) => {
        const card = document.createElement('div');
        card.className = 'table-card';
        const useTitle = shouldUseCardTitle(headers, row);

        Array.from(row.cells).forEach((cell, i) => {
            const value = cellText(cell);
            if (!value) {
                return;
            }

            if (i === 0 && useTitle) {
                const title = document.createElement('h3');
                title.className = 'table-card-title';
                title.textContent = value;
                card.appendChild(title);
                return;
            }

            appendCardRow(card, headers[i], value);
        });

        if (card.childNodes.length) {
            stack.appendChild(card);
        }
    });

    if (stack.childNodes.length) {
        table.replaceWith(stack);
    }
}

function flattenReaderTables(root) {
    if (!root) {
        return;
    }

    Array.from(root.querySelectorAll('table')).forEach((table) => {
        if (!root.contains(table)) {
            return;
        }
        flattenTable(table);
    });
}

ER.flattenReaderTables = flattenReaderTables;
})(window.ER);
