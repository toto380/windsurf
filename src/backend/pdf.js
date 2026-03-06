/**
 * STRATADS - PDF EXPORTER
 * Export propre HTML → PDF avec Playwright
 * Évite les coupures de cartes/graphes
 */

const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

class PDFExporter {
  constructor(options = {}) {
    this.options = {
      format: options.format || 'A4',
      margin: options.margin || { top: '60px', bottom: '60px', left: '40px', right: '40px' },
      printBackground: true,
      displayHeaderFooter: true,
      ...options
    };
  }

  /**
   * Exporte un fichier HTML en PDF
   * @param {string} htmlPath - Chemin vers le fichier HTML
   * @param {string} outputPath - Chemin de sortie du PDF
   * @param {Object} metadata - Métadonnées pour header/footer
   */
  async export(htmlPath, outputPath, metadata = {}) {
    if (!await fs.pathExists(htmlPath)) {
      throw new Error(`Fichier HTML non trouvé: ${htmlPath}`);
    }

    const browser = await chromium.launch();
    
    try {
      const page = await browser.newPage();
      
      // Charger le fichier HTML
      const fileUrl = 'file:///' + path.resolve(htmlPath).replace(/\\/g, '/');
      await page.goto(fileUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Attendre que les graphiques/charts se rendent
      await page.waitForTimeout(2000);

      // Injecter des styles print supplémentaires si nécessaire
      await this.injectPrintStyles(page);

      // Générer le PDF
      const pdfOptions = {
        path: outputPath,
        format: this.options.format,
        printBackground: this.options.printBackground,
        displayHeaderFooter: this.options.displayHeaderFooter,
        margin: this.options.margin,
        headerTemplate: this.buildHeaderTemplate(metadata),
        footerTemplate: this.buildFooterTemplate(metadata)
      };

      await page.pdf(pdfOptions);

      return {
        success: true,
        path: outputPath,
        size: (await fs.stat(outputPath)).size
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Exporte directement depuis du HTML string (sans fichier intermédiaire)
   */
  async exportFromHTML(htmlContent, outputPath, metadata = {}) {
    const browser = await chromium.launch();
    
    try {
      const page = await browser.newPage();
      
      // Définir le contenu HTML
      await page.setContent(htmlContent, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      await page.waitForTimeout(2000);
      await this.injectPrintStyles(page);

      const pdfOptions = {
        path: outputPath,
        format: this.options.format,
        printBackground: this.options.printBackground,
        displayHeaderFooter: this.options.displayHeaderFooter,
        margin: this.options.margin,
        headerTemplate: this.buildHeaderTemplate(metadata),
        footerTemplate: this.buildFooterTemplate(metadata)
      };

      await page.pdf(pdfOptions);

      return {
        success: true,
        path: outputPath,
        size: (await fs.stat(outputPath)).size
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Injecte des styles CSS print pour éviter les coupures
   */
  async injectPrintStyles(page) {
    const printStyles = `
      <style>
        @media print {
          /* Éviter les coupures au milieu des éléments */
          .card, .chart-container, .kpi-card, .recommendation-card, 
          .section-box, table, .quick-win-item, .funnel-stage {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          
          /* Forcer les sauts de page sur les sections principales */
          .page-break {
            page-break-after: always !important;
          }
          
          /* Titres de section doivent rester avec leur contenu */
          h1, h2, h3 {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }
          
          /* Éviter les lignes de tableau orphelines */
          tr {
            break-inside: avoid !important;
          }
          
          thead {
            display: table-header-group !important;
          }
          
          /* Ajuster les graphiques */
          svg, canvas, .chart {
            max-width: 100% !important;
            height: auto !important;
          }
          
          /* Cacher les éléments non essentiels en print */
          .no-print, .interactive-only {
            display: none !important;
          }
          
          /* S'assurer que le fond est imprimé */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      </style>
    `;

    await page.evaluate((styles) => {
      const styleEl = document.createElement('div');
      styleEl.innerHTML = styles;
      document.head.appendChild(styleEl.firstElementChild);
    }, printStyles);
  }

  buildHeaderTemplate(metadata) {
    const company = metadata.company || '';
    const type = metadata.auditType ? metadata.auditType.toUpperCase() : '';
    
    return `
      <div style="font-size: 9px; width: 100%; text-align: center; color: #666; padding: 10px 0; border-bottom: 1px solid #ddd;">
        <span style="font-weight: bold;">StratAds Audit</span>
        ${company ? ` — ${company}` : ''}
        ${type ? ` [${type}]` : ''}
        <span style="float: right; margin-right: 40px;">Confidentiel</span>
      </div>
    `;
  }

  buildFooterTemplate(metadata) {
    return `
      <div style="font-size: 9px; width: 100%; text-align: center; color: #666; padding: 10px 0; border-top: 1px solid #ddd;">
        <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        <span style="float: right; margin-right: 40px;">© StratAds</span>
      </div>
    `;
  }

  /**
   * Vérifie si un PDF a été généré correctement
   */
  async validatePDF(pdfPath) {
    try {
      const stats = await fs.stat(pdfPath);
      return {
        valid: stats.size > 1000, // Au moins 1KB
        size: stats.size,
        path: pdfPath
      };
    } catch {
      return { valid: false, size: 0, path: pdfPath };
    }
  }
}

module.exports = { PDFExporter };
