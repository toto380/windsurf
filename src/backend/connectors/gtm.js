const { GoogleAuth } = require('google-auth-library');

class GTMConnector {
  constructor(serviceAccountPath, accountId, containerId) {
    this.serviceAccountPath = serviceAccountPath;
    this.accountId = accountId;
    this.containerId = containerId;
    this.auth = null;
  }

  async authenticate() {
    try {
      const auth = new GoogleAuth({
        keyFile: this.serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/tagmanager.readonly']
      });
      this.auth = await auth.getClient();
      return true;
    } catch (error) {
      console.error('[GTM] Auth error:', error.message);
      return false;
    }
  }

  async fetchData() {
    if (!this.auth) {
      const ok = await this.authenticate();
      if (!ok) throw new Error('Authentication failed');
    }

    const tagmanager = await import('googleapis').then(mod => mod.tagmanager('v2'));
    const client = tagmanager.tagmanager({ version: 'v2', auth: this.auth });

    try {
      // 1. Get account info
      const account = await client.accounts.get({ path: `accounts/${this.accountId}` });

      // 2. Get container info
      const container = await client.accounts.containers.get({
        path: `accounts/${this.accountId}/containers/${this.containerId}`
      });

      // 3. List all tags
      const tags = await client.accounts.containers.tags.list({
        parent: `accounts/${this.accountId}/containers/${this.containerId}`
      });

      // 4. List all triggers
      const triggers = await client.accounts.containers.triggers.list({
        parent: `accounts/${this.accountId}/containers/${this.containerId}`
      });

      // 5. List all variables
      const variables = await client.accounts.containers.variables.list({
        parent: `accounts/${this.accountId}/containers/${this.containerId}`
      });

      // Analyze tags for issues
      const tagAnalysis = this._analyzeTags(tags.data.tag || []);
      const triggerAnalysis = this._analyzeTriggers(triggers.data.trigger || []);
      const variableAnalysis = this._analyzeVariables(variables.data.variable || []);

      return {
        status: 'ok',
        account: {
          name: account.data.name,
          id: this.accountId
        },
        container: {
          name: container.data.name,
          id: this.containerId,
          version: container.data.containerVersionId
        },
        tags: tagAnalysis,
        triggers: triggerAnalysis,
        variables: variableAnalysis,
        evidence: `Data fetched from GTM account ${this.accountId}, container ${this.containerId}`,
        confidence: 'HIGH'
      };

    } catch (error) {
      console.error('[GTM] Data fetch error:', error.message);
      return {
        status: 'error',
        error: error.message,
        evidence: `Failed to fetch data from GTM account ${this.accountId}`,
        confidence: 'LOW'
      };
    }
  }

  _analyzeTags(tags) {
    const issues = [];
    const statusCounts = { enabled: 0, disabled: 0, paused: 0 };

    tags.forEach(tag => {
      const status = tag.firingTriggerId?.length > 0 ? 'enabled' : 'disabled';
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      // Check for common issues
      if (!tag.firingTriggerId || tag.firingTriggerId.length === 0) {
        issues.push({
          tag: tag.name || 'Unnamed',
          type: 'no_triggers',
          severity: 'high',
          message: 'Tag has no firing triggers'
        });
      }

      if (tag.type === 'html' && tag.parameter?.find(p => p.key === 'html')) {
        const html = tag.parameter.find(p => p.key === 'html').value;
        if (html.includes('console.log')) {
          issues.push({
            tag: tag.name || 'Unnamed',
            type: 'console_log',
            severity: 'medium',
            message: 'Tag contains console.log statements'
          });
        }
      }

      if (tag.type === 'gaawc' && !tag.parameter?.find(p => p.key === 'trackingId')) {
        issues.push({
          tag: tag.name || 'Unnamed',
          type: 'missing_tracking_id',
          severity: 'high',
          message: 'Google Analytics tag missing tracking ID'
        });
      }
    });

    return {
      total: tags.length,
      statusCounts,
      issues: issues.slice(0, 20) // Limit to top 20 issues
    };
  }

  _analyzeTriggers(triggers) {
    const issues = [];
    const typeCounts = {};

    triggers.forEach(trigger => {
      const type = trigger.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      // Check for common issues
      if (trigger.type === 'PAGE_VIEW' && !trigger.filter) {
        issues.push({
          trigger: trigger.name || 'Unnamed',
          type: 'pageview_no_filter',
          severity: 'medium',
          message: 'Page View trigger has no filters'
        });
      }

      if (trigger.type === 'CUSTOM_EVENT' && (!trigger.parameter || !trigger.parameter.find(p => p.key === 'eventName'))) {
        issues.push({
          trigger: trigger.name || 'Unnamed',
          type: 'custom_event_no_name',
          severity: 'high',
          message: 'Custom Event trigger missing event name'
        });
      }
    });

    return {
      total: triggers.length,
      typeCounts,
      issues: issues.slice(0, 10)
    };
  }

  _analyzeVariables(variables) {
    const issues = [];
    const typeCounts = {};

    variables.forEach(variable => {
      const type = variable.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      // Check for common issues
      if (variable.type === 'jsm' && variable.parameter?.find(p => p.key === 'javascript')) {
        const js = variable.parameter.find(p => p.key === 'javascript').value;
        if (js.includes('undefined') || js.includes('null')) {
          issues.push({
            variable: variable.name || 'Unnamed',
            type: 'potential_null_undefined',
            severity: 'low',
            message: 'JavaScript variable may return null/undefined'
          });
        }
      }
    });

    return {
      total: variables.length,
      typeCounts,
      issues: issues.slice(0, 10)
    };
  }

  static async testConnection(serviceAccountPath, accountId, containerId) {
    if (!serviceAccountPath || !accountId) {
      return { success: false, error: 'Service account path and account ID are required' };
    }

    try {
      const connector = new GTMConnector(serviceAccountPath, accountId, containerId);
      const authOk = await connector.authenticate();
      if (!authOk) {
        return { success: false, error: 'Authentication failed' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { GTMConnector };
