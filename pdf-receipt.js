/* ==============================================
   PDF RECEIPT GENERATION
   ============================================== */
async function generateReceiptPDF(seminariste) {
    if (!seminariste) return showToast('Aucun séminariste sélectionné', 'error');

    try {
        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Colors
        const primaryColor = '#2563eb';
        const darkColor = '#1e293b';
        const lightColor = '#64748b';

        // Header with logo area
        doc.setFillColor(37, 99, 235); // Primary blue
        doc.rect(0, 0, 210, 40, 'F');

        // Title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('REÇU D\'INSCRIPTION', 105, 20, { align: 'center' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text('JOSPIA -2025', 105, 30, { align: 'center' });

        // Photo section
        if (seminariste.photo_url) {
            try {
                // Create a promise to load the image
                const imgData = await loadImageAsDataURL(seminariste.photo_url);
                doc.addImage(imgData, 'JPEG', 155, 50, 40, 50);

                // Photo border
                doc.setDrawColor(37, 99, 235);
                doc.setLineWidth(0.5);
                doc.rect(155, 50, 40, 50);
            } catch (err) {
                console.warn('Could not load photo for PDF', err);
            }
        }

        // Information section
        let yPos = 60;
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(12);

        // Matricule (highlighted)
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(15, yPos - 5, 130, 12, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text('MATRICULE:', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(14);
        doc.text(seminariste.matricule || 'N/A', 60, yPos);
        yPos += 20;

        // Nom complet
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('NOM COMPLET:', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(13);
        doc.text(`${seminariste.nom || ''} ${seminariste.prenom || ''}`.toUpperCase(), 60, yPos);
        yPos += 15;

        // Dortoir
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('DORTOIR:', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(seminariste.dortoir || 'Non assigné', 60, yPos);
        yPos += 15;

        // Halaqa
        doc.setFont('helvetica', 'bold');
        doc.text('GROUPE HALAQA:', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(seminariste.halaqa || 'Non assigné', 60, yPos);
        yPos += 15;

        // Genre
        doc.setFont('helvetica', 'bold');
        doc.text('GENRE:', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(seminariste.genre === 'M' ? 'Masculin' : 'Féminin', 60, yPos);
        yPos += 25;

        // Separator line
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.line(15, yPos, 195, yPos);
        yPos += 15;

        // Date and year
        const currentDate = new Date().toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Date d'inscription: ${currentDate}`, 20, yPos);
        yPos += 10;
        doc.text(`Année académique: ${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, 20, yPos);

        // Footer
        yPos = 260;
        doc.setDrawColor(203, 213, 225);
        doc.line(15, yPos, 195, yPos);
        yPos += 10;
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('JOSPIA - Commission Administration & Scientifique', 105, yPos, { align: 'center' });
        yPos += 5;
        doc.text('Ce document certifie l\'inscription du séminariste mentionné ci-dessus', 105, yPos, { align: 'center' });

        // QR Code section
        try {
            // Create QR code data
            const qrData = JSON.stringify({
                matricule: seminariste.matricule,
                nom: seminariste.nom,
                prenom: seminariste.prenom,
                date: new Date().toISOString().split('T')[0]
            });

            // Generate QR code as data URL
            const qrCodeDataURL = await generateQRCode(qrData);

            // Add QR code to PDF (bottom right corner)
            doc.addImage(qrCodeDataURL, 'PNG', 165, 245, 30, 30);

            // QR code label
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.text('Scanner pour vérifier', 180, 277, { align: 'center' });
        } catch (err) {
            console.warn('Could not generate QR code', err);
        }

        // Download the PDF
        const fileName = `recu_${seminariste.matricule || 'inscription'}.pdf`;
        doc.save(fileName);

        showToast('Reçu PDF téléchargé avec succès', 'success');

    } catch (err) {
        console.error('Error generating PDF:', err);
        showToast('Erreur lors de la génération du PDF', 'error');
    }
}

// Helper function to load image as data URL
async function loadImageAsDataURL(url) {
    return new Promise((resolve, reject) => {
        if (url.startsWith('data:')) {
            // Already a data URL
            resolve(url);
        } else {
            // Remote URL - fetch and convert
            fetch(url)
                .then(response => {
                    if (!response.ok) throw new Error('Image load failed: ' + response.statusText);
                    return response.blob();
                })
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                })
                .catch(reject);
        }
    });
}

// Helper function to generate QR code as data URL
async function generateQRCode(data) {
    return new Promise((resolve, reject) => {
        try {
            // Create a temporary container for QR code
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);

            // Generate QR code
            const qrcode = new QRCode(tempDiv, {
                text: data,
                width: 256,
                height: 256,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });

            // Wait a bit for QR code to render
            setTimeout(() => {
                const canvas = tempDiv.querySelector('canvas');
                if (canvas) {
                    const dataURL = canvas.toDataURL('image/png');
                    document.body.removeChild(tempDiv);
                    resolve(dataURL);
                } else {
                    document.body.removeChild(tempDiv);
                    reject(new Error('QR code canvas not found'));
                }
            }, 100);
        } catch (err) {
            reject(err);
        }
    });
}

/* ==============================================
   MASS EXPORT OF RECEIPTS
   ============================================== */
async function exportAllReceiptsPDF(seminaristes, groupName) {
    if (!seminaristes || seminaristes.length === 0) {
        return showToast('Aucun séminariste à exporter', 'warning');
    }

    const zip = new JSZip();
    let count = 0;
    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = 'Génération en cours...';
    btn.disabled = true;

    try {
        showToast(`Génération de ${seminaristes.length} reçus...`, 'info');

        for (const seminariste of seminaristes) {
            try {
                // Generate PDF for this seminariste
                const pdfBlob = await generateReceiptPDFBlob(seminariste);

                // Add to ZIP
                const fileName = `recu_${seminariste.matricule || count}.pdf`;
                zip.file(fileName, pdfBlob);
                count++;
            } catch (err) {
                console.warn(`Failed to generate receipt for ${seminariste.matricule}`, err);
            }
        }

        if (count === 0) {
            throw new Error('Aucun reçu n\'a pu être généré');
        }

        // Generate ZIP
        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recus_${groupName.replace(/\s+/g, '_').toLowerCase()}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);

        showToast(`${count} reçus exportés avec succès`, 'success');

    } catch (err) {
        console.error('Mass export failed', err);
        showToast('Erreur lors de l\'export en masse', 'error');
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}

// Helper function to generate PDF as Blob (for mass export)
async function generateReceiptPDFBlob(seminariste) {
    if (!seminariste) throw new Error('No seminariste data');

    // Initialize jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    // Colors
    const primaryColor = '#2563eb';
    const darkColor = '#1e293b';
    const lightColor = '#64748b';

    // Header with logo area
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 40, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('REÇU D\'INSCRIPTION', 105, 20, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('JOSPIA - Séminaire Islamique', 105, 30, { align: 'center' });

    // Photo section
    if (seminariste.photo_url) {
        try {
            const imgData = await loadImageAsDataURL(seminariste.photo_url);
            doc.addImage(imgData, 'JPEG', 155, 50, 40, 50);
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(0.5);
            doc.rect(155, 50, 40, 50);
        } catch (err) {
            console.warn('Could not load photo for PDF', err);
        }
    }

    // Information section
    let yPos = 60;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);

    // Matricule
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(15, yPos - 5, 130, 12, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('MATRICULE:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text(seminariste.matricule || 'N/A', 60, yPos);
    yPos += 20;

    // Nom complet
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NOM COMPLET:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text(`${seminariste.nom || ''} ${seminariste.prenom || ''}`.toUpperCase(), 60, yPos);
    yPos += 15;

    // Dortoir
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DORTOIR:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(seminariste.dortoir || 'Non assigné', 60, yPos);
    yPos += 15;

    // Halaqa
    doc.setFont('helvetica', 'bold');
    doc.text('GROUPE HALAQA:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(seminariste.halaqa || 'Non assigné', 60, yPos);
    yPos += 15;

    // Genre
    doc.setFont('helvetica', 'bold');
    doc.text('GENRE:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(seminariste.genre === 'M' ? 'Masculin' : 'Féminin', 60, yPos);
    yPos += 25;

    // Separator line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, 195, yPos);
    yPos += 15;

    // Date and year
    const currentDate = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Date d'inscription: ${currentDate}`, 20, yPos);
    yPos += 10;
    doc.text(`Année académique: ${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, 20, yPos);

    // Footer
    yPos = 260;
    doc.setDrawColor(203, 213, 225);
    doc.line(15, yPos, 195, yPos);
    yPos += 10;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('JOSPIA - Commission Administration & Scientifique', 105, yPos, { align: 'center' });
    yPos += 5;
    doc.text('Ce document certifie l\'inscription du séminariste mentionné ci-dessus', 105, yPos, { align: 'center' });

    // QR Code
    try {
        const qrData = JSON.stringify({
            matricule: seminariste.matricule,
            nom: seminariste.nom,
            prenom: seminariste.prenom,
            date: new Date().toISOString().split('T')[0]
        });
        const qrCodeDataURL = await generateQRCode(qrData);
        doc.addImage(qrCodeDataURL, 'PNG', 165, 245, 30, 30);
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('Scanner pour vérifier', 180, 277, { align: 'center' });
    } catch (err) {
        console.warn('Could not generate QR code', err);
    }

    // Return as Blob
    return doc.output('blob');
}
