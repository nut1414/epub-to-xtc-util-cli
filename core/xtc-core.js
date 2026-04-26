(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.XtcCore = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    const PROGRESS_BAR_HEIGHT = 14;
    const PROGRESS_BAR_HEIGHT_FULLWIDTH = 20;
    const PROGRESS_BAR_HEIGHT_EXTENDED = 28;

    function getChapterInfoForPage(pageNum, toc, totalPages) {
        if (!toc || toc.length === 0) return null;

        let topLevelChapter = null;
        let topLevelIndex = 0;
        let topLevelPage = -1;
        const topLevelTotal = toc.length;

        for (let i = 0; i < toc.length; i++) {
            const item = toc[i];
            if (item.page <= pageNum && item.page > topLevelPage) {
                topLevelChapter = item;
                topLevelIndex = i + 1;
                topLevelPage = item.page;
            }
        }

        if (!topLevelChapter) return null;

        const currentChapter = {
            title: topLevelChapter.title,
            startPage: topLevelChapter.page,
            index: topLevelIndex,
            totalCount: topLevelTotal,
            level: 0,
        };

        let deepestPage = currentChapter.startPage;

        function findDeepestChapter(items, depth) {
            for (const item of items) {
                if (item.page <= pageNum && item.page > deepestPage) {
                    deepestPage = item.page;
                    currentChapter.startPage = item.page;
                    currentChapter.title = item.title;
                    currentChapter.level = depth;
                }
                if (item.children && item.children.length > 0) {
                    findDeepestChapter(item.children, depth + 1);
                }
            }
        }
        findDeepestChapter(toc, 0);

        let foundNext = false;
        function findNextChapter(items) {
            for (const item of items) {
                if (foundNext) return;
                if (item.page > currentChapter.startPage) {
                    currentChapter.endPage = item.page - 1;
                    foundNext = true;
                    return;
                }
                if (item.children) findNextChapter(item.children);
            }
        }
        findNextChapter(toc);
        if (!foundNext) {
            currentChapter.endPage = totalPages - 1;
        }

        return currentChapter;
    }

    function getChapterPositions(toc, totalPages) {
        const positions = [];
        const total = totalPages || 1;
        function extractPositions(items) {
            for (const item of items) {
                positions.push(item.page / total);
                if (item.children && item.children.length > 0) {
                    extractPositions(item.children);
                }
            }
        }
        if (toc && toc.length > 0) extractPositions(toc);
        return positions;
    }

    function drawProgressIndicator(ctx, settings, currentPage, totalPages, opts) {
        if (!settings.enableProgressBar) return;
        const screenWidth = opts.screenWidth;
        const screenHeight = opts.screenHeight;
        const toc = opts.toc || [];
        const fontFamily = opts.progressBarFontFamily || 'sans-serif';

        const lineThickness = 1;
        const progressThickness = 4;
        const chapterMarkHeight = 11;
        const edgeMargin = settings.progressEdgeMargin || 0;
        const sideMargin = settings.progressSideMargin || 0;
        const padding = 8 + sideMargin;
        const isTop = settings.progressPosition === 'top';
        const isFullWidth = settings.progressFullWidth;
        const hasProgressLine = settings.showProgressLine || settings.showChapterProgress;
        const hasBothLines = settings.showProgressLine && settings.showChapterProgress;

        let barHeight = PROGRESS_BAR_HEIGHT;
        if (settings.showChapterMarks || (isFullWidth && hasBothLines)) {
            barHeight = PROGRESS_BAR_HEIGHT_EXTENDED;
        } else if (isFullWidth && hasProgressLine) {
            barHeight = PROGRESS_BAR_HEIGHT_FULLWIDTH;
        }

        const baseY = isTop ? edgeMargin : screenHeight - barHeight - edgeMargin;
        const centerY = baseY + barHeight / 2;

        const isNegative = settings.enableNegative;
        const bgColor = isNegative ? '#000000' : '#ffffff';
        const textColor = isNegative ? '#ffffff' : '#000000';
        const baseLineColor = isNegative ? '#ffffff' : '#000000';
        const progressColor = isNegative ? '#ffffff' : '#000000';
        const chapterMarkColor = isNegative ? '#ffffff' : '#000000';

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, baseY, screenWidth, barHeight);

        const fontSize = settings.progressFontSize || 10;
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'middle';

        let leftText = '';
        if (settings.showChapterPage || settings.showChapterPercent) {
            const chapterInfo = getChapterInfoForPage(currentPage, toc, totalPages);
            if (chapterInfo) {
                const chapterPages = chapterInfo.endPage - chapterInfo.startPage + 1;
                const pageInChapter = currentPage - chapterInfo.startPage + 1;
                const leftParts = [];
                if (settings.showChapterPage) leftParts.push(`${pageInChapter}/${chapterPages}`);
                if (settings.showChapterPercent) {
                    const chapterPercent = Math.round((pageInChapter / chapterPages) * 100);
                    leftParts.push(`${chapterPercent}%`);
                }
                leftText = leftParts.join('  ');
            }
        }

        let rightText = '';
        const rightParts = [];
        if (settings.showPageInfo) rightParts.push(`${currentPage + 1}/${totalPages}`);
        if (settings.showBookPercent) {
            const bookPercent = Math.round(((currentPage + 1) / totalPages) * 100);
            rightParts.push(`${bookPercent}%`);
        }
        rightText = rightParts.join('  ');

        const leftTextWidth = leftText ? ctx.measureText(leftText).width : 0;
        const rightTextWidth = rightText ? ctx.measureText(rightText).width : 0;

        let barStartX, barEndX, barWidth, lineY;

        if (isFullWidth && hasProgressLine) {
            lineY = baseY + 4;
            const textY = baseY + barHeight - fontSize / 2 - 1;
            barStartX = padding;
            barEndX = screenWidth - padding;
            barWidth = barEndX - barStartX;

            if (leftText) {
                ctx.fillStyle = textColor;
                ctx.textAlign = 'left';
                ctx.fillText(leftText, padding, textY);
            }
            if (rightText) {
                ctx.fillStyle = textColor;
                ctx.textAlign = 'right';
                ctx.fillText(rightText, screenWidth - padding, textY);
            }
        } else {
            lineY = centerY;
            barStartX = padding + (leftText ? leftTextWidth + 12 : 0);
            barEndX = screenWidth - padding - (rightText ? rightTextWidth + 12 : 0);
            barWidth = barEndX - barStartX;

            if (leftText) {
                ctx.fillStyle = textColor;
                ctx.textAlign = 'left';
                ctx.fillText(leftText, padding, centerY);
            }
            if (rightText) {
                ctx.fillStyle = textColor;
                ctx.textAlign = 'right';
                ctx.fillText(rightText, screenWidth - padding, centerY);
            }
        }

        if (settings.showProgressLine && barWidth > 0) {
            ctx.strokeStyle = baseLineColor;
            ctx.lineWidth = lineThickness;
            ctx.beginPath();
            ctx.moveTo(barStartX, lineY);
            ctx.lineTo(barEndX, lineY);
            ctx.stroke();

            const progress = (currentPage + 1) / totalPages;
            const progressX = barStartX + barWidth * progress;
            ctx.strokeStyle = progressColor;
            ctx.lineWidth = progressThickness;
            ctx.beginPath();
            ctx.moveTo(barStartX, lineY);
            ctx.lineTo(progressX, lineY);
            ctx.stroke();

            if (settings.showChapterMarks) {
                const positions = getChapterPositions(toc, totalPages);
                ctx.strokeStyle = chapterMarkColor;
                ctx.lineWidth = 1;
                for (const pos of positions) {
                    const markX = barStartX + pos * barWidth;
                    if (markX >= barStartX && markX <= barEndX) {
                        ctx.beginPath();
                        ctx.moveTo(markX, lineY - chapterMarkHeight / 2);
                        ctx.lineTo(markX, lineY + chapterMarkHeight / 2);
                        ctx.stroke();
                    }
                }
            }
        }

        if (settings.showChapterProgress && barWidth > 0) {
            const chapterInfo = getChapterInfoForPage(currentPage, toc, totalPages);
            if (chapterInfo) {
                const chapterPages = chapterInfo.endPage - chapterInfo.startPage + 1;
                const pageInChapter = currentPage - chapterInfo.startPage + 1;
                const chapterProgress = pageInChapter / chapterPages;

                if (!settings.showProgressLine) {
                    ctx.strokeStyle = baseLineColor;
                    ctx.lineWidth = lineThickness;
                    ctx.beginPath();
                    ctx.moveTo(barStartX, lineY);
                    ctx.lineTo(barEndX, lineY);
                    ctx.stroke();
                }

                const chapterY = settings.showProgressLine ? lineY + 9 : lineY;
                const chapterProgressX = barStartX + barWidth * chapterProgress;
                ctx.strokeStyle = progressColor;
                ctx.lineWidth = settings.showProgressLine ? 2 : progressThickness;
                ctx.beginPath();
                ctx.moveTo(barStartX, chapterY);
                ctx.lineTo(chapterProgressX, chapterY);
                ctx.stroke();
            }
        }
    }

    function applyDitheringSyncToData(data, width, height, bits, strength, xthMode) {
        const factor = strength / 100;
        const pixelCount = width * height;

        const err7_16 = factor * 7 / 16;
        const err3_16 = factor * 3 / 16;
        const err5_16 = factor * 5 / 16;
        const err1_16 = factor * 1 / 16;

        let quantize;
        if (xthMode) {
            quantize = (val) => {
                if (val > 212) return 255;
                else if (val > 127) return 170;
                else if (val > 42) return 85;
                else return 0;
            };
        } else {
            const levels = Math.pow(2, bits);
            const step = 255 / (levels - 1);
            const invStep = 1 / step;
            quantize = (val) => Math.round(val * invStep) * step;
        }

        const gray = new Float32Array(pixelCount);

        for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
            gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }

        const widthM1 = width - 1;
        const heightM1 = height - 1;

        for (let y = 0; y < height; y++) {
            const rowStart = y * width;
            const nextRowStart = rowStart + width;
            const isNotLastRow = y < heightM1;

            for (let x = 0; x < width; x++) {
                const idx = rowStart + x;
                const oldPixel = gray[idx];
                const newPixel = quantize(oldPixel);

                gray[idx] = newPixel;
                const error = oldPixel - newPixel;

                if (x < widthM1) gray[idx + 1] += error * err7_16;
                if (isNotLastRow) {
                    if (x > 0) gray[nextRowStart + x - 1] += error * err3_16;
                    gray[nextRowStart + x] += error * err5_16;
                    if (x < widthM1) gray[nextRowStart + x + 1] += error * err1_16;
                }
            }
        }

        for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
            const g = gray[i] < 0 ? 0 : (gray[i] > 255 ? 255 : (gray[i] + 0.5) | 0);
            data[idx] = data[idx + 1] = data[idx + 2] = g;
        }
    }

    function applyDithering(ctx, width, height, bits, strength, xthMode) {
        const imageData = ctx.getImageData(0, 0, width, height);
        applyDitheringSyncToData(imageData.data, width, height, bits, strength, xthMode);
        ctx.putImageData(imageData, 0, 0);
    }

    function quantizeImage(ctx, width, height, bits, xthMode) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const len = data.length;

        if (xthMode) {
            for (let i = 0; i < len; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                let quantized;
                if (gray > 212) quantized = 255;
                else if (gray > 127) quantized = 170;
                else if (gray > 42) quantized = 85;
                else quantized = 0;
                data[i] = data[i + 1] = data[i + 2] = quantized;
            }
        } else {
            const levels = Math.pow(2, bits);
            const step = 255 / (levels - 1);
            const invStep = 1 / step;
            for (let i = 0; i < len; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const quantized = ((gray * invStep + 0.5) | 0) * step;
                data[i] = data[i + 1] = data[i + 2] = quantized;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    function applyNegative(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function generateXtgData(canvas, bits) {
        const width = canvas.width;
        const height = canvas.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        function writeHeader(view, dataSize, bitCode) {
            view.setUint8(0, 0x58);
            view.setUint8(1, 0x54);
            view.setUint8(2, 0x47);
            view.setUint8(3, 0x00);
            view.setUint16(4, width, true);
            view.setUint16(6, height, true);
            view.setUint8(8, 0);
            view.setUint8(9, bitCode);
            view.setUint32(10, dataSize, true);
        }

        if (bits === 1) {
            const bytesPerRow = (width + 7) >> 3;
            const dataSize = bytesPerRow * height;
            const buffer = new ArrayBuffer(22 + dataSize);
            const view = new DataView(buffer);
            const dataArray = new Uint8Array(buffer);
            writeHeader(view, dataSize, 0);

            let pixelIdx = 0;
            for (let y = 0; y < height; y++) {
                const rowOffset = 22 + y * bytesPerRow;
                for (let x = 0; x < width; x += 8) {
                    let byte = 0;
                    const endX = Math.min(x + 8, width);
                    for (let bx = x; bx < endX; bx++) {
                        if (data[pixelIdx] >= 128) byte |= (1 << (7 - (bx - x)));
                        pixelIdx += 4;
                    }
                    dataArray[rowOffset + (x >> 3)] = byte;
                }
            }
            return buffer;
        } else if (bits === 2) {
            const bytesPerRow = (width + 3) >> 2;
            const dataSize = bytesPerRow * height;
            const buffer = new ArrayBuffer(22 + dataSize);
            const view = new DataView(buffer);
            const dataArray = new Uint8Array(buffer);
            writeHeader(view, dataSize, 1);

            let pixelIdx = 0;
            for (let y = 0; y < height; y++) {
                const rowOffset = 22 + y * bytesPerRow;
                for (let x = 0; x < width; x += 4) {
                    let byte = 0;
                    const endX = Math.min(x + 4, width);
                    for (let bx = x; bx < endX; bx++) {
                        const level = data[pixelIdx] >> 6;
                        byte |= (level << ((3 - (bx - x)) * 2));
                        pixelIdx += 4;
                    }
                    dataArray[rowOffset + (x >> 2)] = byte;
                }
            }
            return buffer;
        } else {
            const bytesPerRow = (width + 1) >> 1;
            const dataSize = bytesPerRow * height;
            const buffer = new ArrayBuffer(22 + dataSize);
            const view = new DataView(buffer);
            const dataArray = new Uint8Array(buffer);
            writeHeader(view, dataSize, 2);

            let pixelIdx = 0;
            for (let y = 0; y < height; y++) {
                const rowOffset = 22 + y * bytesPerRow;
                for (let x = 0; x < width; x += 2) {
                    let byte = 0;
                    const endX = Math.min(x + 2, width);
                    for (let bx = x; bx < endX; bx++) {
                        const level = data[pixelIdx] >> 4;
                        byte |= (level << ((1 - (bx - x)) * 4));
                        pixelIdx += 4;
                    }
                    dataArray[rowOffset + (x >> 1)] = byte;
                }
            }
            return buffer;
        }
    }

    function generateXthData(canvas) {
        const width = canvas.width;
        const height = canvas.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const bytesPerColumn = Math.ceil(height / 8);
        const planeSize = bytesPerColumn * width;
        const dataSize = planeSize * 2;

        const buffer = new ArrayBuffer(22 + dataSize);
        const view = new DataView(buffer);
        const dataArray = new Uint8Array(buffer);

        view.setUint8(0, 0x58);
        view.setUint8(1, 0x54);
        view.setUint8(2, 0x48);
        view.setUint8(3, 0x00);
        view.setUint16(4, width, true);
        view.setUint16(6, height, true);
        view.setUint8(8, 0);
        view.setUint8(9, 0);
        view.setUint32(10, dataSize, true);

        const plane1Offset = 22;
        const plane2Offset = 22 + planeSize;

        for (let x = width - 1; x >= 0; x--) {
            for (let y = 0; y < height; y++) {
                const pixelIdx = (y * width + x) * 4;
                const gray = data[pixelIdx];

                let val;
                if (gray > 212) val = 0;
                else if (gray > 127) val = 2;
                else if (gray > 42) val = 1;
                else val = 3;

                const bit1 = (val >> 1) & 1;
                const bit2 = val & 1;

                const colIdx = (width - 1 - x);
                const byteInCol = Math.floor(y / 8);
                const byteIdx = colIdx * bytesPerColumn + byteInCol;
                const bitIdx = 7 - (y % 8);

                if (bit1) dataArray[plane1Offset + byteIdx] |= (1 << bitIdx);
                if (bit2) dataArray[plane2Offset + byteIdx] |= (1 << bitIdx);
            }
        }

        return buffer;
    }

    async function processEpub(opts) {
        const renderer = opts.renderer;
        const toc = opts.toc || [];
        const metadata = opts.metadata || {};
        const settings = opts.settings;
        const screenWidth = opts.screenWidth;
        const screenHeight = opts.screenHeight;
        const deviceWidth = opts.deviceWidth;
        const deviceHeight = opts.deviceHeight;
        const createCanvas = opts.createCanvas;
        const ditherAsync = opts.ditherAsync || null;
        const progressBarFontFamily = opts.progressBarFontFamily || 'sans-serif';
        const onProgress = opts.onProgress || null;

        const headerSize = 56;
        const metadataSize = 256;
        const chapterEntrySize = 96;
        const indexEntrySize = 16;

        const pageBuffers = [];
        let totalDataSize = 0;

        const bits = settings.bitDepth;
        const isHQ = settings.qualityMode === 'hq';
        const pageCount = renderer.getPageCount();

        const chapters = [];
        function extractChapters(items) {
            for (const item of items) {
                const page = Math.max(0, Math.min(item.page, pageCount - 1));
                chapters.push({
                    name: (item.title || '').substring(0, 79),
                    startPage: page,
                    endPage: -1,
                });
                if (item.children && item.children.length > 0) extractChapters(item.children);
            }
        }
        extractChapters(toc);
        chapters.sort((a, b) => a.startPage - b.startPage);

        const tempCanvas = createCanvas(screenWidth, screenHeight);
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        const pendingDither = [];
        const PIPELINE_DEPTH = 2;

        function finalizePage(imageData, page) {
            tempCtx.putImageData(imageData, 0, 0);

            if (settings.enableNegative) applyNegative(tempCtx, screenWidth, screenHeight);

            drawProgressIndicator(tempCtx, settings, page, pageCount, {
                screenWidth,
                screenHeight,
                toc,
                progressBarFontFamily,
            });

            const rotation = settings.rotation;
            let finalCanvas = tempCanvas;

            if (rotation !== 0) {
                const rotatedCanvas = createCanvas(deviceWidth, deviceHeight);
                const rCtx = rotatedCanvas.getContext('2d');

                if (rotation === 90) {
                    rCtx.translate(deviceWidth, 0);
                    rCtx.rotate(90 * Math.PI / 180);
                } else if (rotation === 180) {
                    rCtx.translate(deviceWidth, deviceHeight);
                    rCtx.rotate(180 * Math.PI / 180);
                } else if (rotation === 270) {
                    rCtx.translate(0, deviceHeight);
                    rCtx.rotate(270 * Math.PI / 180);
                }
                rCtx.drawImage(tempCanvas, 0, 0);

                finalCanvas = rotatedCanvas;
            }

            return isHQ ? generateXthData(finalCanvas) : generateXtgData(finalCanvas, 1);
        }

        for (let page = 0; page < pageCount; page++) {
            if (onProgress) {
                const progress = Math.round((page / pageCount) * 100);
                onProgress(progress, 100, `Rendering page ${page + 1} of ${pageCount}...`);
            }

            renderer.goToPage(page);
            renderer.renderCurrentPage();

            const buffer = renderer.getFrameBuffer();
            const imageData = tempCtx.createImageData(screenWidth, screenHeight);
            imageData.data.set(buffer);

            if (settings.enableDithering && ditherAsync) {
                const ditherPromise = ditherAsync(imageData, bits, settings.ditherStrength, isHQ);
                pendingDither.push({ page, promise: ditherPromise });
            } else {
                tempCtx.putImageData(imageData, 0, 0);
                if (settings.enableDithering) {
                    applyDithering(tempCtx, screenWidth, screenHeight, bits, settings.ditherStrength, isHQ);
                } else {
                    quantizeImage(tempCtx, screenWidth, screenHeight, bits, isHQ);
                }
                const finalImageData = tempCtx.getImageData(0, 0, screenWidth, screenHeight);
                const pageData = finalizePage(finalImageData, page);
                pageBuffers[page] = pageData;
                totalDataSize += pageData.byteLength;
            }

            while (pendingDither.length >= PIPELINE_DEPTH) {
                const oldest = pendingDither.shift();
                const ditheredData = await oldest.promise;
                const finalImageData = tempCtx.createImageData(screenWidth, screenHeight);
                finalImageData.data.set(ditheredData);
                const pageData = finalizePage(finalImageData, oldest.page);
                pageBuffers[oldest.page] = pageData;
                totalDataSize += pageData.byteLength;
            }
        }

        while (pendingDither.length > 0) {
            const oldest = pendingDither.shift();
            const ditheredData = await oldest.promise;
            const finalImageData = tempCtx.createImageData(screenWidth, screenHeight);
            finalImageData.data.set(ditheredData);
            const pageData = finalizePage(finalImageData, oldest.page);
            pageBuffers[oldest.page] = pageData;
            totalDataSize += pageData.byteLength;
        }

        for (let i = 0; i < chapters.length; i++) {
            if (i < chapters.length - 1) {
                chapters[i].endPage = chapters[i + 1].startPage - 1;
            } else {
                chapters[i].endPage = pageCount - 1;
            }
            if (chapters[i].endPage < chapters[i].startPage) {
                chapters[i].endPage = chapters[i].startPage;
            }
        }

        const chapterCount = chapters.length;
        const hasChapters = chapterCount > 0 ? 1 : 0;

        const metadataOffset = headerSize;
        const chaptersOffset = metadataOffset + metadataSize;
        const chaptersSize = chapterCount * chapterEntrySize;
        const indexOffset = chaptersOffset + chaptersSize;
        const indexSize = pageCount * indexEntrySize;
        const dataOffset = indexOffset + indexSize;
        const totalSize = dataOffset + totalDataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const dataArray = new Uint8Array(buffer);

        view.setUint8(0, 0x58);
        view.setUint8(1, 0x54);
        view.setUint8(2, 0x43);
        view.setUint8(3, isHQ ? 0x48 : 0x00);
        view.setUint16(4, 1, true);
        view.setUint16(6, pageCount, true);
        view.setUint8(8, 0);
        view.setUint8(9, 1);
        view.setUint8(10, 0);
        view.setUint8(11, hasChapters);
        view.setUint32(12, 1, true);

        view.setBigUint64(16, BigInt(metadataOffset), true);
        view.setBigUint64(24, BigInt(indexOffset), true);
        view.setBigUint64(32, BigInt(dataOffset), true);
        view.setBigUint64(40, BigInt(0), true);
        view.setBigUint64(48, BigInt(chaptersOffset), true);

        const encoder = new TextEncoder();
        const title = metadata.title || 'Untitled';
        const author = metadata.authors || 'Unknown';

        const titleBytes = encoder.encode(title);
        const authorBytes = encoder.encode(author);

        for (let i = 0; i < Math.min(titleBytes.length, 127); i++) {
            dataArray[metadataOffset + i] = titleBytes[i];
        }
        for (let i = 0; i < Math.min(authorBytes.length, 63); i++) {
            dataArray[metadataOffset + 0x80 + i] = authorBytes[i];
        }

        view.setUint32(metadataOffset + 0xF0, Math.floor(Date.now() / 1000), true);
        view.setUint16(metadataOffset + 0xF4, 0, true);
        view.setUint16(metadataOffset + 0xF6, chapterCount, true);

        for (let i = 0; i < chapters.length; i++) {
            const chapterOffset = chaptersOffset + i * chapterEntrySize;
            const chapter = chapters[i];

            const nameBytes = encoder.encode(chapter.name);
            for (let j = 0; j < Math.min(nameBytes.length, 79); j++) {
                dataArray[chapterOffset + j] = nameBytes[j];
            }

            view.setUint16(chapterOffset + 0x50, chapter.startPage + 1, true);
            view.setUint16(chapterOffset + 0x52, chapter.endPage + 1, true);
        }

        let absoluteOffset = dataOffset;
        for (let i = 0; i < pageCount; i++) {
            const indexEntryAddr = indexOffset + i * indexEntrySize;
            const pageData = new Uint8Array(pageBuffers[i]);

            view.setBigUint64(indexEntryAddr, BigInt(absoluteOffset), true);
            view.setUint32(indexEntryAddr + 8, pageData.byteLength, true);
            view.setUint16(indexEntryAddr + 12, deviceWidth, true);
            view.setUint16(indexEntryAddr + 14, deviceHeight, true);

            absoluteOffset += pageData.byteLength;
        }

        let writeOffset = dataOffset;
        for (let i = 0; i < pageCount; i++) {
            const pageData = new Uint8Array(pageBuffers[i]);
            dataArray.set(pageData, writeOffset);
            writeOffset += pageData.byteLength;
        }

        return buffer;
    }

    return {
        PROGRESS_BAR_HEIGHT,
        PROGRESS_BAR_HEIGHT_FULLWIDTH,
        PROGRESS_BAR_HEIGHT_EXTENDED,
        getChapterInfoForPage,
        getChapterPositions,
        drawProgressIndicator,
        applyDitheringSyncToData,
        applyDithering,
        quantizeImage,
        applyNegative,
        generateXtgData,
        generateXthData,
        processEpub,
    };
}));
