/**
 * STRATADS CHARTS - Graphiques business pour les rapports
 * Radar chart, Funnel chart, ROAS timeline, etc.
 */

export class StratadsCharts {
  
  /**
   * Radar Chart - Maturité acquisition
   * Axes: tracking, conversion, ads structure, economics, scaling potential
   */
  static generateRadarChart(data) {
    const { tracking, conversion, economics, scalingPotential } = data;
    
    return `
<div class="chart-container">
    <h3>📊 Score de Maturité Acquisition</h3>
    <div class="radar-chart">
        <canvas id="radarChart" width="400" height="400"></canvas>
    </div>
    <script>
        (function() {
            const canvas = document.getElementById('radarChart');
            const ctx = canvas.getContext('2d');
            
            const data = {
                labels: ['Tracking', 'Conversion', 'Structure Ads', 'Economics', 'Scaling Potential'],
                datasets: [{
                    label: 'Score Actuel',
                    data: [${tracking}, ${conversion}, 70, ${economics}, ${scalingPotential}],
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(102, 126, 234, 1)'
                }]
            };
            
            // Simple radar chart implementation
            const centerX = 200;
            const centerY = 200;
            const radius = 150;
            const angles = 5;
            
            // Draw grid
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            
            for (let i = 1; i <= 5; i++) {
                ctx.beginPath();
                for (let j = 0; j < angles; j++) {
                    const angle = (Math.PI * 2 * j) / angles - Math.PI / 2;
                    const x = centerX + Math.cos(angle) * (radius * i / 5);
                    const y = centerY + Math.sin(angle) * (radius * i / 5);
                    if (j === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
            }
            
            // Draw axes
            for (let i = 0; i < angles; i++) {
                const angle = (Math.PI * 2 * i) / angles - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(
                    centerX + Math.cos(angle) * radius,
                    centerY + Math.sin(angle) * radius
                );
                ctx.stroke();
                
                // Labels
                const labelX = centerX + Math.cos(angle) * (radius + 20);
                const labelY = centerY + Math.sin(angle) * (radius + 20);
                ctx.font = '12px Arial';
                ctx.fillStyle = '#333';
                ctx.textAlign = 'center';
                ctx.fillText(data.labels[i], labelX, labelY);
            }
            
            // Draw data
            ctx.beginPath();
            ctx.fillStyle = 'rgba(102, 126, 234, 0.2)';
            ctx.strokeStyle = 'rgba(102, 126, 234, 1)';
            ctx.lineWidth = 2;
            
            const values = data.datasets[0].data;
            for (let i = 0; i < angles; i++) {
                const angle = (Math.PI * 2 * i) / angles - Math.PI / 2;
                const value = values[i] / 100; // Normalize to 0-1
                const x = centerX + Math.cos(angle) * (radius * value);
                const y = centerY + Math.sin(angle) * (radius * value);
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Draw points
            for (let i = 0; i < angles; i++) {
                const angle = (Math.PI * 2 * i) / angles - Math.PI / 2;
                const value = values[i] / 100;
                const x = centerX + Math.cos(angle) * (radius * value);
                const y = centerY + Math.sin(angle) * (radius * value);
                
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(102, 126, 234, 1)';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        })();
    </script>
</div>`;
  }

  /**
   * Funnel Chart - Visualisation du tunnel de conversion
   */
  static generateFunnelChart(data) {
    const { impressions, clicks, sessions, addToCart, checkout, purchase } = data;
    
    const steps = [
      { name: 'Impressions', value: impressions, color: '#667eea' },
      { name: 'Clicks', value: clicks, color: '#764ba2' },
      { name: 'Sessions', value: sessions, color: '#f093fb' },
      { name: 'Add to Cart', value: addToCart, color: '#f5576c' },
      { name: 'Checkout', value: checkout, color: '#fda085' },
      { name: 'Purchase', value: purchase, color: '#f6d365' }
    ];
    
    const maxValue = Math.max(...steps.map(s => s.value));
    
    return `
<div class="chart-container">
    <h3>📊 Tunnel de Conversion</h3>
    <div class="funnel-chart">
        ${steps.map((step, index) => {
          const width = (step.value / maxValue) * 100;
          const prevValue = index > 0 ? steps[index - 1].value : step.value;
          const conversionRate = prevValue > 0 ? ((step.value / prevValue) * 100).toFixed(1) : 0;
          
          return `
            <div class="funnel-step">
                <div class="funnel-bar" style="width: ${width}%; background: ${step.color};">
                    <div class="funnel-label">
                        <span class="step-name">${step.name}</span>
                        <span class="step-value">${step.value.toLocaleString()}</span>
                    </div>
                </div>
                <div class="conversion-rate">
                    ${index > 0 ? `${conversionRate}%` : ''}
                </div>
            </div>
          `;
        }).join('')}
    </div>
    <div class="funnel-legend">
        <div class="legend-item">
            <div class="legend-color"></div>
            <span>Taux de conversion entre étapes</span>
        </div>
    </div>
</div>`;
  }

  /**
   * ROAS Timeline - Graphique temporel du ROAS
   */
  static generateROASTimeline(data) {
    const { dailyData } = data;
    
    return `
<div class="chart-container">
    <h3>📈 Évolution ROAS (30 jours)</h3>
    <div class="roas-timeline">
        <canvas id="roasChart" width="800" height="300"></canvas>
    </div>
    <script>
        (function() {
            const canvas = document.getElementById('roasChart');
            const ctx = canvas.getContext('2d');
            
            const data = ${JSON.stringify(dailyData)};
            const padding = 40;
            const chartWidth = canvas.width - padding * 2;
            const chartHeight = canvas.height - padding * 2;
            
            // Find min and max values
            const maxROAS = Math.max(...data.map(d => d.roas));
            const minROAS = Math.min(...data.map(d => d.roas));
            const range = maxROAS - minROAS || 1;
            
            // Draw axes
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, canvas.height - padding);
            ctx.lineTo(canvas.width - padding, canvas.height - padding);
            ctx.stroke();
            
            // Draw grid lines
            ctx.strokeStyle = '#f0f0f0';
            for (let i = 0; i <= 5; i++) {
                const y = padding + (chartHeight * i) / 5;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(canvas.width - padding, y);
                ctx.stroke();
                
                // Y-axis labels
                const value = maxROAS - (range * i) / 5;
                ctx.fillStyle = '#666';
                ctx.font = '11px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(value.toFixed(1), padding - 10, y + 4);
            }
            
            // Draw line chart
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            data.forEach((point, index) => {
                const x = padding + (chartWidth * index) / (data.length - 1);
                const y = padding + chartHeight - ((point.roas - minROAS) / range) * chartHeight;
                
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            
            ctx.stroke();
            
            // Draw points
            data.forEach((point, index) => {
                const x = padding + (chartWidth * index) / (data.length - 1);
                const y = padding + chartHeight - ((point.roas - minROAS) / range) * chartHeight;
                
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fillStyle = '#667eea';
                ctx.fill();
                
                // Hover effect (simplified)
                if (index % 5 === 0) { // Show every 5th label
                    ctx.fillStyle = '#333';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(point.date, x, canvas.height - padding + 20);
                }
            });
            
            // Title
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('ROAS', padding - 25, canvas.height / 2);
        })();
    </script>
</div>`;
  }

  /**
   * CPA Scatter Plot - CPA vs Conversion Rate
   */
  static generateCPAScatterPlot(data) {
    const { campaigns } = data;
    
    return `
<div class="chart-container">
    <h3>📊 CPA vs Taux de Conversion</h3>
    <div class="scatter-plot">
        <canvas id="scatterChart" width="600" height="400"></canvas>
    </div>
    <script>
        (function() {
            const canvas = document.getElementById('scatterChart');
            const ctx = canvas.getContext('2d');
            
            const data = ${JSON.stringify(campaigns)};
            const padding = 50;
            const chartWidth = canvas.width - padding * 2;
            const chartHeight = canvas.height - padding * 2;
            
            // Find ranges
            const maxCPA = Math.max(...data.map(d => d.cpa));
            const maxCR = Math.max(...data.map(d => d.conversionRate));
            
            // Draw axes
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, canvas.height - padding);
            ctx.lineTo(canvas.width - padding, canvas.height - padding);
            ctx.stroke();
            
            // Draw grid
            ctx.strokeStyle = '#f0f0f0';
            for (let i = 0; i <= 5; i++) {
                // Horizontal lines
                const y = padding + (chartHeight * i) / 5;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(canvas.width - padding, y);
                ctx.stroke();
                
                // Vertical lines
                const x = padding + (chartWidth * i) / 5;
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, canvas.height - padding);
                ctx.stroke();
            }
            
            // Draw points
            data.forEach(point => {
                const x = padding + (point.cpa / maxCPA) * chartWidth;
                const y = canvas.height - padding - (point.conversionRate / maxCR) * chartHeight;
                
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, 2 * Math.PI);
                ctx.fillStyle = point.roas > 3 ? '#22c55e' : point.roas > 2 ? '#f59e0b' : '#ef4444';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
            
            // Axis labels
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('CPA (€)', canvas.width / 2, canvas.height - 10);
            
            ctx.save();
            ctx.translate(15, canvas.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText('Taux de Conversion (%)', 0, 0);
            ctx.restore();
        })();
    </script>
</div>`;
  }

  /**
   * Budget Allocation Chart - Répartition du budget
   */
  static generateBudgetAllocation(data) {
    const { googleAds, metaAds, organic, direct, other } = data;
    
    const total = googleAds + metaAds + organic + direct + other;
    
    const segments = [
      { name: 'Google Ads', value: googleAds, color: '#4285F4' },
      { name: 'Meta Ads', value: metaAds, color: '#1877F2' },
      { name: 'Organic', value: organic, color: '#22c55e' },
      { name: 'Direct', value: direct, color: '#f59e0b' },
      { name: 'Autre', value: other, color: '#6b7280' }
    ].filter(segment => segment.value > 0);
    
    return `
<div class="chart-container">
    <h3>💰 Répartition du Budget</h3>
    <div class="budget-allocation">
        <div class="pie-chart">
            <canvas id="pieChart" width="300" height="300"></canvas>
        </div>
        <div class="budget-legend">
            ${segments.map(segment => {
              const percentage = ((segment.value / total) * 100).toFixed(1);
              return `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${segment.color};"></div>
                    <span class="legend-name">${segment.name}</span>
                    <span class="legend-value">€${segment.value.toLocaleString()} (${percentage}%)</span>
                </div>
              `;
            }).join('')}
        </div>
    </div>
    <script>
        (function() {
            const canvas = document.getElementById('pieChart');
            const ctx = canvas.getContext('2d');
            
            const data = ${JSON.stringify(segments)};
            const total = ${total};
            const centerX = 150;
            const centerY = 150;
            const radius = 100;
            
            let currentAngle = -Math.PI / 2;
            
            data.forEach(segment => {
                const sliceAngle = (segment.value / total) * Math.PI * 2;
                
                // Draw slice
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                ctx.closePath();
                ctx.fillStyle = segment.color;
                ctx.fill();
                
                // Draw border
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Draw percentage
                const labelAngle = currentAngle + sliceAngle / 2;
                const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
                const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
                
                const percentage = ((segment.value / total) * 100).toFixed(1);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(percentage + '%', labelX, labelY);
                
                currentAngle += sliceAngle;
            });
        })();
    </script>
</div>`;
  }

  /**
   * Growth Potential Chart - Projection de croissance
   */
  static generateGrowthPotential(data) {
    const { currentRevenue, potentialRevenue, projections } = data;
    
    return `
<div class="chart-container">
    <h3>🚀 Potentiel de Croissance</h3>
    <div class="growth-comparison-chart">
        <div class="growth-bars">
            <div class="growth-bar current">
                <div class="bar-fill" style="height: ${(currentRevenue / potentialRevenue) * 100}%;"></div>
                <div class="bar-label">Actuel</div>
                <div class="bar-value">€${(currentRevenue / 1000000).toFixed(1)}M</div>
            </div>
            <div class="growth-bar potential">
                <div class="bar-fill" style="height: 100%; background: linear-gradient(135deg, #22c55e, #16a34a);"></div>
                <div class="bar-label">Potentiel</div>
                <div class="bar-value">€${(potentialRevenue / 1000000).toFixed(1)}M</div>
            </div>
        </div>
        <div class="growth-metrics">
            <div class="metric">
                <span class="metric-label">Croissance possible</span>
                <span class="metric-value">+${(((potentialRevenue - currentRevenue) / currentRevenue) * 100).toFixed(0)}%</span>
            </div>
            <div class="metric">
                <span class="metric-label">Perte actuelle</span>
                <span class="metric-value critical">€${((potentialRevenue - currentRevenue) / 1000000).toFixed(1)}M</span>
            </div>
        </div>
    </div>
</div>`;
  }

  // Styles CSS pour tous les graphiques
  static getChartStyles() {
    return `
        .chart-container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        
        .chart-container h3 {
            color: #667eea;
            margin-bottom: 20px;
            font-size: 1.3em;
        }
        
        .radar-chart, .funnel-chart, .roas-timeline, .scatter-plot, .budget-allocation, .growth-comparison-chart {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .funnel-step {
            display: flex;
            align-items: center;
            margin-bottom: 2px;
            width: 100%;
        }
        
        .funnel-bar {
            height: 40px;
            background: #667eea;
            border-radius: 4px;
            margin-right: 10px;
            position: relative;
            min-width: 200px;
        }
        
        .funnel-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 15px;
            height: 100%;
            color: white;
            font-weight: bold;
        }
        
        .conversion-rate {
            font-size: 0.9em;
            color: #666;
            min-width: 50px;
        }
        
        .budget-allocation {
            display: flex;
            gap: 30px;
            align-items: center;
        }
        
        .budget-legend {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 3px;
        }
        
        .legend-name {
            flex: 1;
            font-weight: 500;
        }
        
        .legend-value {
            font-weight: bold;
            color: #667eea;
        }
        
        .growth-bars {
            display: flex;
            gap: 40px;
            margin-bottom: 30px;
        }
        
        .growth-bar {
            flex: 1;
            text-align: center;
        }
        
        .growth-bar {
            width: 120px;
            height: 200px;
            background: #f3f4f6;
            border-radius: 8px;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
        }
        
        .bar-fill {
            width: 100%;
            background: #667eea;
            border-radius: 0 0 8px 8px;
            transition: height 0.5s ease;
        }
        
        .bar-label {
            margin-top: 10px;
            font-weight: bold;
            color: #333;
        }
        
        .bar-value {
            margin-bottom: 10px;
            font-size: 1.2em;
            font-weight: bold;
            color: #667eea;
        }
        
        .growth-metrics {
            display: flex;
            gap: 30px;
            justify-content: center;
        }
        
        .metric {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        .metric-label {
            display: block;
            margin-bottom: 5px;
            color: #666;
        }
        
        .metric-value {
            display: block;
            font-size: 1.5em;
            font-weight: bold;
            color: #333;
        }
        
        .metric-value.critical {
            color: #ef4444;
        }
        
        canvas {
            max-width: 100%;
            height: auto;
        }
    `;
  }
}
