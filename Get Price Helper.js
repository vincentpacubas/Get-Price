function clearTravelLine(record, pb, params) {
    var linePriceField = getItemForDetailRecordKey(getTotalLinePriceField(record), record);
    var unitPriceField = getItemForDetailRecordKey(getUnitPriceField(record), record);
    var coverageField = getItemForDetailRecordKey("Covered__c", record);
    linePriceField.value = 0;
    unitPriceField.value = 0;
    coverageField.value = 0;
    params.calculatedQuantityField.value = 0;
}

function getTravelPolicy(context, pb) {

    var travelPolicyInfo = getFromPriceBookDefinition(pb, "CONTRACT_TRAVELPOLICY"),
        appliedTravelPolicy = null;

    if (travelPolicyInfo) {
        var wo = getMasterWorkOrder(context, pb);
        appliedTravelPolicy = executeTravelPolicy(travelPolicyInfo.data, pb, wo);
    }
    return appliedTravelPolicy;
}

function executeTravelPolicy(travelPolicyInfo, pb, wo) {
    var i, l = travelPolicyInfo.length,
        appliedTravelPolicy = null;
    for (i = 0; i < l; i++) {
        var travelPolicy = travelPolicyInfo[i];
        var expressionId = travelPolicy[getQualifiedFieldName("Named_Expression__c")];
        var expression = getExpression(expressionId, pb);
        if (!expression) {
            appliedTravelPolicy = travelPolicy;
            break;
        } else {
            var result = executeExpression(expression, wo);
            if (result == true) {
                appliedTravelPolicy = travelPolicy;
                break;
            }
        }
    }
    return appliedTravelPolicy;
}
/*///////////////////////////////////////////////// END - TRAVEL FUNCTIONS ////////////////////////////////////////////*/

function getDuration(lineItem, inMinutes) {
    var startDateTime = null,
        endDateTime = null;
    var startDate = getItemForDetailRecordKey("Start_Date_and_Time__c", lineItem);
    var endDate = getItemForDetailRecordKey("End_Date_and_Time__c", lineItem);
    var duration = -1;

    if (startDate == null || startDate.value == null || startDate.value == "" ||
        endDate == null || endDate.value == null || endDate.value == "") {
        duration = -1;
    } else {

        /* Calculate time */
        startDateTime = getDateFromString(startDate.value);
        endDateTime = getDateFromString(endDate.value);
        var diff = (endDateTime - startDateTime) / (1000.0 * 60.0);

        if (!inMinutes) {
            diff /= 60.0;
            /* Assumed to be in hours */
            diff = Math.ceil(diff);
        }
        if (diff > 0) {
            duration = Math.round(diff * 100) / 100;
        }
    }
    return duration;
}

function applyWarranty(coverageField, params, wField) {
    var warranty;
    coverageField.value = 0;
    var detailLineId = params.detailLineId;
    if (!params.isLineEntitled) {
        warranty = params.warranty;
    } else {
        if (IBWarranty && IBWarranty[detailLineId])
            warranty = IBWarranty[detailLineId];
    }
    if (warranty) {
        var coverage = warranty[getQualifiedFieldName(wField)];
        coverageField.value = getOnlyPositiveValue(coverage);
        return true;
    } else {
        $EXPR.Logger.info(tag['TAG026']);
    }
}

function applyServiceOffering(coverageField, so, coveredField, notCoveredField) {
    var response = new Object(),
        coverage = null,
        fld = null;
    response.isCovered = false;
    response.applied = false;
    if (so) {
        if (so.isCovered) {
            fld = coveredField;
            response.isCovered = true;
        } else {
            fld = notCoveredField;
        }

        coverage = so[getQualifiedFieldName(fld)];
        coverageField.value = getOnlyPositiveValue(coverage);
        response.applied = true;
    } else {
        $EXPR.Logger.info(tag['TAG027']);
    }

    return response;
}

function addLogWorkOrderLine(logField, logMessage) {
    logField.value += logMessage + '';
    logField.value1 += logMessage + '';
    $EXPR.Logger.info(logMessage);
}

function getOnlyPositiveValue(value) {
    if (value == null || value < 0) {
        return 0;
    } else {
        return value;
    }
}

function getPriceBookIdForRecordType(recordType, recordTypeInfo) {
    var rtype2PriceBookMap = recordTypeInfo.valueMap,
        l = rtype2PriceBookMap.length,
        i, pbKey = null;
    for (i = 0; i < l; i++) {
        var rtype2PriceBook = rtype2PriceBookMap[i];
        if (rtype2PriceBook.key == recordType.value) {
            pbKey = rtype2PriceBook.value;
            break;
        }
    }
    return pbKey;
}

function getFromPriceBookDefinition(pb, key) {
    var i, l = pb.length,
        ret = null;
    for (i = 0; i < l; i++) {
        if (pb[i].key == key) {
            ret = pb[i];
            break;
        }
    }
    return ret;
}

function getWarrantyDefinition(pb) {
    var wDef = getFromPriceBookDefinition(pb, "WARRANTYDEFINITION"),
        ret = null;
    if (wDef) ret = wDef.data[0];

    return ret;
}

function getIBWarrantyDefinition(pb) {
    var wDef = getFromPriceBookDefinition(pb, "IBWARRANTY"),
        ret = null;
    IBWarranty = createSingleObject(wDef);


    /*Line SCON Definition*/
    wDef = getFromPriceBookDefinition(pb, "LINECONTRACTDEFINITION");
    IBSconDefinition = createSingleObject(wDef);


    /*Line Parts Pricing*/
    wDef = getFromPriceBookDefinition(pb, "LINEPARTSPRICING");
    IBSconPartsPricing = createObject(wDef);

    /*Line Parts Discount Pricing */
    wDef = getFromPriceBookDefinition(pb, "LINEPARTSDISCOUNTPRICING");
    IBSconPartsDiscount = createObject(wDef);


    wDef = getFromPriceBookDefinition(pb, "LINELABORPRICING");
    IBSconLaborPricing = createObject(wDef);

    wDef = getFromPriceBookDefinition(pb, "LINEEXPENSEPRICING");
    IBExpenseInfo = createObject(wDef);

    wDef = getFromPriceBookDefinition(pb, "LINEPARTPRICEBOOK");
    LinePartPriceBook = createObject(wDef);

    wDef = getFromPriceBookDefinition(pb, "LINELABORPRICEBOOK");
    LineLaborPriceBook = createObject(wDef);

    wDef = getFromPriceBookDefinition(pb, "LINEWARRANTYENTITLED");
    var valueMap = [];
    if (wDef && wDef.valueMap) {
        var valueList = wDef.valueMap;
        for (var i = 0; i < valueList.length; i++) {
            valueMap.push(valueList[i]);
        }
    }

    wDef = getFromPriceBookDefinition(pb, "LINESCONTRACTENTITLED");
    if (wDef && wDef.valueMap) {
        var valueList = wDef.valueMap;
        for (var i = 0; i < valueList.length; i++) {
            valueMap.push(valueList[i]);
        }
    }
    for (var i = 0; i < valueMap.length; i++) {
        if (valueMap[i]) {
            if (valueMap[i].key && valueMap[i].value) {
                if (PSEntitled[valueMap[i].key] && PSEntitled[valueMap[i].key] == 'true') {
                    continue;
                }
                PSEntitled[valueMap[i].key] = valueMap[i].value;
            }
        }
    }


    return ret;
}

function createSingleObject(wDef) {
    var tempObj = new Object();
    if (wDef && wDef.valueMap) {
        if (!wDef.valueMap.length)
            wDef.valueMap = [wDef.valueMap];
        for (var i = 0; i < wDef.valueMap.length; i++) {
            if (wDef.valueMap[i]) {
                if (wDef.valueMap[i].values && !wDef.valueMap[i].values.length) {
                    wDef.valueMap[i].values = [wDef.valueMap[i].values];
                }
                if (wDef.valueMap[i].values) {
                    for (var j = 0; j < wDef.valueMap[i].values.length; j++) {
                        tempObj[wDef.valueMap[i].values[j]] = wDef.valueMap[i].record;
                    }
                }
            }
        }
    }
    return tempObj;
}

function createObject(wDef) {
    var tempObj = new Object();
    if (wDef && wDef.valueMap) {
        if (!wDef.valueMap.length)
            wDef.valueMap = [wDef.valueMap];
        for (var i = 0; i < wDef.valueMap.length; i++) {
            if (wDef.valueMap[i]) {
                if (wDef.valueMap[i].values && !wDef.valueMap[i].values.length) {
                    wDef.valueMap[i].values = [wDef.valueMap[i].values];
                }
                if (wDef.valueMap[i].values) {
                    for (var j = 0; j < wDef.valueMap[i].values.length; j++) {
                        if (tempObj[wDef.valueMap[i].values[j]]) {
                            var temp = tempObj[wDef.valueMap[i].values[j]];
                            temp.push(wDef.valueMap[i].record);
                            tempObj[wDef.valueMap[i].values[j]] = temp;
                        } else {
                            tempObj[wDef.valueMap[i].values[j]] = [wDef.valueMap[i].record];
                        }
                    }
                }
            }
        }
    }
    return tempObj;
}

function getServiceOffering(pb) {
    var so = getFromPriceBookDefinition(pb, "CONTRACT_SERVICEOFFERING"),
        ret = null;
    if (so) {
        ret = so.data[0];
        ret.isCovered = (so.value == "COVERED") ? true : false;
    }
    return ret;
}

function getItemForDetailRecordKey(key, record) {


    key = getFieldAPI(key);

    var length = record.length,
        k, ret = "";
    for (k = 0; k < length; k++) {
        var fld = record[k];
        if (fld.key == key) {
            ret = fld;
            break;
        }
    }
    return ret;
}

function getFieldAPI(key) {
    if (key.indexOf("__c", key.length - "__c".length) !== -1) {
        key = $EXPR.getOrgNamespace() + "__" + key;
    }
    return key;
}

function getQualifiedFieldName(name) {
    return $EXPR.getOrgNamespace() + "__" + name;
}

function getDateFromString(dateStr) {
    var dt = dateStr.split(" ");
    var date = dt[0].split("-");
    var time = dt[1].split(":");
    return new Date(parseInt(date[0], 10), parseInt(date[1] - 1, 10), parseInt(date[2], 10),
        parseInt(time[0], 10), parseInt(time[1], 10), parseInt(time[2], 10));
}


/* Hack to get around mixed ID lengths */
function get15CharId(id) {
    if (id && id.length == 18) {
        id = id.substring(0, 15);
    }

    return id;
}

function formatAdvancedExpression() {
    if (arguments.length == 0) {
        return "";
    }

    var formatted = arguments[0];

    for (var i = 0; i < arguments[1].length; i++) {
        formatted = formatted.split("" + (i + 1)).join(arguments[1][i]);
    }
    return formatted;
}

function getProductDefinition(pb, product) {
    var prodDefinitionInfo = getFromPriceBookDefinition(pb, "PRODUCT_DEFINITION"),
        ret = null;
    if (prodDefinitionInfo) {
        var allProdDefinitionInfo = prodDefinitionInfo.data,
            i, l = allProdDefinitionInfo.length;
        for (i = 0; i < l; i++) {
            if (allProdDefinitionInfo[i].Id == product.value) {
                ret = allProdDefinitionInfo[i];
                break;
            }
        }
    }
    return ret;
}

function executeExpression(expression, wo) {

    var expressionLines = expression.data,
        j, elength = expressionLines.length,
        exp = [],
        input = [];
    expressionLines = $SORT(expressionLines, getQualifiedFieldName("Sequence__c"));
    for (j = 0; j < elength; j++) {
        var expressionLine = expressionLines[j];
        var field = expressionLine[getQualifiedFieldName("Field_Name__c")];
        var operator = expressionLine[getQualifiedFieldName("Operator__c")];
        var operand = expressionLine[getQualifiedFieldName("Operand__c")];

        input[j] = {
            field: field,
            value: operand
        };
        if (operator == "starts") {
            exp[j] = $FORMAT("$STARTS_WITH({0})", "input[" + j + "]");
        } else if (operator == "contains") {
            exp[j] = $FORMAT("$CONTAINS({0})", "input[" + j + "]");
        } else if (operator == "eq") {
            exp[j] = $FORMAT("$EQUALS({0})", "input[" + j + "]");
        } else if (operator == "ne") {
            exp[j] = $FORMAT("$NOT_EQUALS({0})", "input[" + j + "]");
        } else if (operator == "gt") {
            exp[j] = $FORMAT("$GREATER_THAN({0})", "input[" + j + "]");
        } else if (operator == "ge") {
            exp[j] = $FORMAT("$GREATER_THAN_OR_EQUAL_TO({0})", "input[" + j + "]");
        } else if (operator == "lt") {
            exp[j] = $FORMAT("$LESS_THAN({0})", "input[" + j + "]");
        } else if (operator == "le") {
            exp[j] = $FORMAT("$LESS_THAN_OR_EQUAL_TO({0})", "input[" + j + "]");
        } else if (operator == "isnotnull") {
            exp[j] = $FORMAT("$IS_NOT_NULL({0})", "input[" + j + "]");
        } else if (operator == "isnull") {
            exp[j] = $FORMAT("$IS_NULL({0})", "input[" + j + "]");
        }
    }

    var advancedExpression = expression.value;
    if (!advancedExpression || advancedExpression == null) {
        advancedExpression = "( ";
        for (k = 0; k < exp.length; k++) {
            advancedExpression += (k + 1) + " AND ";
        }


        /* Remove the last AND */
        advancedExpression = advancedExpression.substring(0, advancedExpression.length - 4);
        advancedExpression += " )";
    }


    /* Replace apex conditional operators with JS operators */
    advancedExpression = advancedExpression.toUpperCase();
    advancedExpression = advancedExpression.split("AND").join("&&").split("OR").join("||");
    var jsExpression = formatAdvancedExpression(advancedExpression, exp);


    /* Evaluate the expression */
    var result = true;
    (function(jsExpression, wo) {

        function $EQUALS(ip) {
            if (wo[ip.field] == ip.value) {
                return true;
            } else {
                return false;
            }
        }

        function $STARTS_WITH(ip) {
            var field = wo[ip.field];
            if (!field) field = "";

            return field.indexOf(ip.value) == 0;
        }

        function $CONTAINS(ip) {
            var field = wo[ip.field];
            if (!field) field = "";

            return field.indexOf(ip.value) != -1;
        }


        function $NOT_EQUALS(ip) {
            var field = wo[ip.field],
                value = ip.value;
            if (!field) field = "";

            value = convertTargetToSourceType(field, value);
            return (field != value);
        }

        function $GREATER_THAN(ip) {
            var field = wo[ip.field],
                value = ip.value;
            if (!field) field = "";

            value = convertTargetToSourceType(field, value);
            return (field > value);
        }

        function $GREATER_THAN_OR_EQUAL_TO(ip) {
            var field = wo[ip.field],
                value = ip.value;
            if (!field) field = "";

            value = convertTargetToSourceType(field, value);
            return (field >= value);
        }

        function $LESS_THAN(ip) {
            var field = wo[ip.field],
                value = ip.value;
            if (!field) field = "";

            value = convertTargetToSourceType(field, value);
            return (field < value);
        }

        function $LESS_THAN_OR_EQUAL_TO(ip) {
            var field = wo[ip.field],
                value = ip.value;
            if (!field) field = "";

            value = convertTargetToSourceType(field, value);
            return (field <= value);
        }

        function $IS_NOT_NULL(ip) {
            var field = wo[ip.field];
            return !!field;
        }

        function $IS_NULL(ip) {
            var field = wo[ip.field];
            return !field;
        }

        function convertTargetToSourceType(source, target) {
            var ret = target,
                sourceType = typeof(source);
            if (sourceType == 'string') ret = "" + ret;
            else if (sourceType == 'boolean') ret = !!ret;
            else if (sourceType == 'number') ret = parseInt(ret, 10);

            return ret;
        }
        result = eval(jsExpression);
    })(jsExpression, wo);

    return result;
}

function getExpression(expressionId, pb) {
    var ret = null;
    if (expressionId) {
        var expressionsInfo = getFromPriceBookDefinition(pb, "RULES"),
            i;
        if (expressionsInfo == null) return ret; /*For invalid expressions*/
        var allExpressions = expressionsInfo.valueMap,
            l = allExpressions.length;
        for (i = 0; i < l; i++) {
            var expression = allExpressions[i];
            if (get15CharId(expression.key) == get15CharId(expressionId)) {
                ret = expression;
                break;
            }
        }
    }
    return ret;
}

function getMasterWorkOrder(context, pb) {
    var workOrder = getFromPriceBookDefinition(pb, "WORKORDER_DATA").data[0];

    var woFromTransaction = context.headerRecord.records[0].targetRecordAsKeyValue;

    var lookupDef = getFromPriceBookDefinition(pb, "LOOKUP_DEFINITION").valueMap;

    var wo = mergeWO(workOrder, woFromTransaction, lookupDef);
    return wo;
}

function mergeWO(workOrder, woFromTransaction, lookupDef) {
    /* Reference fields */
    var i, l = lookupDef.length;
    for (i = 0; i < l; i++) {
        var def = lookupDef[i];
        workOrder[def.key] = def.value;
    }


    /* Merge transaction into wo data from server */
    l = woFromTransaction.length;
    for (i = 0; i < l; i++) {
        var value = woFromTransaction[i].value1;
        if (!value) {
            value = woFromTransaction[i].value;
        }

        workOrder[woFromTransaction[i].key] = value;
    }

    return workOrder;
}

function getRounded(roundType, mins, actuals) {
    var roundingMins = actuals % 60;
    var remainingMins = actuals - (actuals % 60);
    var intMins = parseInt(mins);
    if (roundType == 'Round Up') {
        if (intMins != 60 && (Math.ceil(roundingMins / intMins) * intMins) != 60)
            return (remainingMins + (Math.ceil(roundingMins / intMins) * intMins % 60));
        else
            return (remainingMins + (Math.ceil(roundingMins / intMins) * intMins));
    } else if (roundType == 'Round Down') {
        if (intMins != 60 && (Math.floor(roundingMins / intMins) * intMins) != 60)
            return (remainingMins + (Math.floor(roundingMins / intMins) * intMins % 60));
        else
            return (remainingMins + (Math.floor(roundingMins / intMins) * intMins));
    }
    return actuals;
}
/*///////////////////////////////////////////////// END - UTILITY FUNCTIONS ////////////////////////////////////////*/

/*///////////////////////////////////////////////// START - PRICING RULE FUNCTIONS /////////////////////////////////*/
function getPricingRuleInfo(pb) {
    var contractDefinitionInfo = getFromPriceBookDefinition(pb, "CONTRACT_DEFINITION"),
        ret = null,
        pricingRuleInfo = null;
    if (contractDefinitionInfo) {
        pricingRuleInfo = getFromPriceBookDefinition(pb, "CONTRACT_PRICINGRULES");
        if (pricingRuleInfo && pricingRuleInfo.data.length > 0) {
            ret = pricingRuleInfo.data;
        }
    }
    return ret;
}

function executePricingRules(pricingRuleInfo, pb, wo) {
    var i, l = pricingRuleInfo.length,
        appliedPricingRule = null;
    for (i = 0; i < l; i++) {
        var pricingRule = pricingRuleInfo[i];
        var expressionId = pricingRule[getQualifiedFieldName("Named_Expression__c")];
        var expression = getExpression(expressionId, pb);
        if (!expression) {
            appliedPricingRule = pricingRule;
            break;
        } else {
            var result = executeExpression(expression, wo);

            if (result == true) {
                appliedPricingRule = pricingRule;
                break;
            }
        }
    }
    return appliedPricingRule;
}
/*///////////////////////////////////////////////// END - PRICING RULE FUNCTIONS ///////////////////////////////////*/

/*///////////////////////////////////////////////// START - UTILITY TO FIND TOTAL LINE PRICE ///////////////////////*/
function getBillableLinePrice(totalLinePrice, discountField, coverageField) {
    var discount = 0;
    var response = 0;
    if (totalLinePrice != null) {
        if (discountField != null && discountField.value != null && discountField.value > 0)
            discount = (totalLinePrice * discountField.value / 100);
        var coverage = 0;
        totalLinePrice = totalLinePrice - discount;
        if (coverageField != null && coverageField.value != null && coverageField.value > 0)
            coverage = (totalLinePrice * coverageField.value / 100);

        response = (totalLinePrice - coverage).toFixed(3);
    }
    return getOnlyPositiveValue(response);
}
/*///////////////////////////////////////////////// END - UTILITY TO FIND TOTAL LINE PRICE /////////////////////////*/

/*///////////////////////////////////////////////// START - UTILITY TO UPDATE WORKORDER FUNCTIONS //////////////////*/
function updateTransactionWORateInfo(context, rateSource, rateTarget, unitSource, unitTarget, rateInfo) {
    var rateApplied = false,
        unitApplied = false,
        woFromTransaction = context.headerRecord.records[0].targetRecordAsKeyValue;
    for (var m = 0;
        (m < woFromTransaction.length) && (rateApplied == false || unitApplied == false); m++) {
        if (woFromTransaction[m].key == getQualifiedFieldName(rateTarget)) {
            woFromTransaction[m].value = rateInfo[getQualifiedFieldName(rateSource)];
            woFromTransaction[m].value1 = rateInfo[getQualifiedFieldName(rateSource)];
            rateApplied = true;
        } else if (woFromTransaction[m].key == getQualifiedFieldName(unitTarget)) {
            woFromTransaction[m].value = rateInfo[getQualifiedFieldName(unitSource)];
            woFromTransaction[m].value1 = rateInfo[getQualifiedFieldName(unitSource)];
            unitApplied = true;
        }
    }
    if (!rateApplied) {
        woFromTransaction[woFromTransaction.length] = {
            key: getQualifiedFieldName(rateTarget),
            value: rateInfo[getQualifiedFieldName(rateSource)],
            value1: rateInfo[getQualifiedFieldName(rateSource)]
        };
    }
    if (!unitApplied) {
        woFromTransaction[woFromTransaction.length] = {
            key: getQualifiedFieldName(unitTarget),
            value: rateInfo[getQualifiedFieldName(unitSource)],
            value1: rateInfo[getQualifiedFieldName(unitSource)]
        };
    }
}

function tagHandler(pb) {
    var tagDefinition = getFromPriceBookDefinition(pb, "TAGS");
    if (tagDefinition.valueMap != null) {
        var l = tagDefinition.valueMap.length;
        for (i = 0; i < l; i++) {
            var tagDef = tagDefinition.valueMap[i];
            tag[tagDef.key] = tagDef.value;
        }
    }
}

function settingHandler(pb) {
    var settingDefinition = getFromPriceBookDefinition(pb, "SETTINGS");
    if (settingDefinition.valueMap != null) {
        var l = settingDefinition.valueMap.length;
        for (i = 0; i < l; i++) {
            var settingDef = settingDefinition.valueMap[i];
            setting[settingDef.key] = settingDef.value;
        }
    }
}

/*///////////////////////////////////////////////// END - UTILITY TO UPDATE WORKORDER FUNCTIONS ///////////////////*/

function getObjectForKeyFromPBWorkOrder(key, pb) {
    key = getFieldAPI(key);
    var retObject = {};
    var lengthOfPB = pb != null && pb.length;
    for (var i = 0; i < lengthOfPB; i++) {
        if (pb[i].key === 'WORKORDER_DATA') {
            var data = pb[i].data;
            retObject.key = key;
            retObject.value = data != null && data.length > 0 && data[0][key];
            break;
        }
    }
    return retObject;
}

function applyPriceBook(context, pb) {

    /* Load all tags and settings */
    tagHandler(pb);
    settingHandler(pb);

    /*Commented as part of story BAC-3279*/
    /* Check if entitlement has been performed */
    /*var isEntitlementPerfromed = getItemForDetailRecordKey('Is_Entitlement_Performed__c', context.headerRecord.records[0].targetRecordAsKeyValue);*/

    /*Added as part of story BAC-3279*/
    var isEntitlementPerfromed = getObjectForKeyFromPBWorkOrder('Is_Entitlement_Performed__c', pb);

    if (setting["WORD005_SET020"] == 'true' && (isEntitlementPerfromed.value == null || isEntitlementPerfromed.value == 'false' || isEntitlementPerfromed.value == false)) {
        $EXPR.Logger.error(tag['EVER005_TAG087']);

        if ($EXPR.showMessage) {
            $EXPR.showMessage({
                text: tag['EVER005_TAG087'],
                type: 'WARN',
                buttons: ['OK'],
                handler: function(evt) {
                    $RETURN(context);
                }
            });
            return false;
        } else {
            alert(tag['EVER005_TAG087']);
            return true;
        }
    } else {

        return continueApplyPriceBook(context, pb);
    }
}

function showAlert(data) {
    alert(JSON.stringify((data)));
}


function continueApplyPriceBook(context, pb) {

    /* Check whether the work order has a tarvel policy */
    var appliedTravelPolicy = getTravelPolicy(context, pb),
        processTravelLines = true;
    processWorkOrderLines = true;

    var contractDefinitionInfo = getFromPriceBookDefinition(pb, "CONTRACT_DEFINITION");

    if ((!appliedTravelPolicy || appliedTravelPolicy == null) && contractDefinitionInfo) {
        contractDefinition = contractDefinitionInfo.data[0];
        appliedTravelPolicy = new Object();
        if (contractDefinition[getQualifiedFieldName("Default_Travel_Price__c")])
            appliedTravelPolicy.SVMXC__Rate__c = contractDefinition[getQualifiedFieldName("Default_Travel_Price__c")];
        else
            appliedTravelPolicy.SVMXC__Rate__c = 0;
        if (contractDefinition[getQualifiedFieldName("Default_Travel_Unit__c")])
            appliedTravelPolicy.SVMXC__Unit__c = contractDefinition[getQualifiedFieldName("Default_Travel_Unit__c")];
    }
    updateTransactionWORateInfo(context, "Rate__c", "Travel_Rate__c", "Unit__c", "Travel_Unit__c", {
        SVMXC__Unit__c: null,
        SVMXC__Rate__c: null
    });

    if (appliedTravelPolicy) {
        var unit = appliedTravelPolicy[getQualifiedFieldName("Unit__c")];
        if (unit == "Flat Rate") {
            processTravelLines = false;
            updateTransactionWORateInfo(context, "Rate__c", "Travel_Rate__c", "Unit__c", "Travel_Unit__c", appliedTravelPolicy);
            if (appliedTravelPolicy.SVMXC__Rate__c != null && appliedTravelPolicy.SVMXC__Rate__c > 0)
                totalWorkOrderPrice += parseFloat(appliedTravelPolicy.SVMXC__Rate__c);
        } else if (unit == "Zone Based") {
            processTravelLines = false;
            if (contractDefinitionInfo) {
                contractDefinition = contractDefinitionInfo.data[0];
                zone = contractDefinition[getQualifiedFieldName("Zone__c")];
                var zonePriceInfo = getFromPriceBookDefinition(pb, "CONTRACT_ZONEPRICING");
                if (zonePriceInfo) {
                    var allzonePricing = zonePriceInfo.data,
                        l = allzonePricing.length;
                    for (i = 0; i < l; i++) {
                        var zonePricing = allzonePricing[i],
                            zoneFromZonePricing = zonePricing[getQualifiedFieldName("Zone__c")];
                        if (zoneFromZonePricing == zone) {
                            updateTransactionWORateInfo(context, "Rate__c", "Travel_Rate__c", "Unit__c", "Travel_Unit__c", {
                                SVMXC__Unit__c: unit,
                                SVMXC__Rate__c: zonePricing.SVMXC__Rate__c
                            });
                            if (zonePricing.SVMXC__Rate__c != null && zonePricing.SVMXC__Rate__c > 0)
                                totalWorkOrderPrice += parseFloat(zonePricing.SVMXC__Rate__c);
                            break;
                        }
                    }
                }
            }
        }
    }

    /* Check whether the work order has a pricing rule */
    var pricingRuleInfo = getPricingRuleInfo(pb);
    var wo = getMasterWorkOrder(context, pb);
    var woContext = context.headerRecord.records[0].targetRecordAsKeyValue;

    if (pricingRuleInfo) {
        var appliedPricingRule = executePricingRules(pricingRuleInfo, pb, wo);
        if (wo.SVMXC__Proforma_Invoice_Amount__c == null)
            wo.SVMXC__Proforma_Invoice_Amount__c = 0;
        var woTotal = getItemForDetailRecordKey('Proforma_Invoice_Amount__c', woContext);
        if (woTotal == null | woTotal == '') {
            woContext[woContext.length] = {
                key: 'SVMXC__Proforma_Invoice_Amount__c',
                value: 0,
                value1: 0
            };
            woTotal = woContext[woContext.length];
        }
        if (appliedPricingRule) {
            updateTransactionWORateInfo(context, "Rate__c", "Rate_Pricing_Rule__c", "Rate_Type__c", "Rate_Type_Pricing_Rule__c", appliedPricingRule);

            var unit = appliedPricingRule[getQualifiedFieldName("Rate_Type__c")];
            if (unit == "Fixed") {
                woTotal.value = appliedPricingRule[getFieldAPI("Rate__c")];
                processWorkOrderLines = false;
            }
        }
    } else {
        var appliedPricingRule = {
            SVMXC__Rate_Type__c: "",
            SVMXC__Rate__c: 0
        };
        updateTransactionWORateInfo(context, "Rate__c", "Rate_Pricing_Rule__c", "Rate_Type__c", "Rate_Type_Pricing_Rule__c", appliedPricingRule);

    }

    if (!processWorkOrderLines) return true;

    var recordTypeInfo = getFromPriceBookDefinition(pb, "RECORDTYPEDEFINITION");

    var i, l = recordTypeInfo.valueMap.length;
    for (var i = 0; i < l; i++) {
        var recordType = recordTypeInfo.valueMap[i];
        recordTypeName[recordType.value] = recordType.key;
    }

    woProduct = getItemForDetailRecordKey("Product__c", context.headerRecord.records[0].targetRecordAsKeyValue);

    detailRecords = context.detailRecords, l = detailRecords.length;
    var warranty = getWarrantyDefinition(pb);

    getIBWarrantyDefinition(pb);
    var so = getServiceOffering(pb);
    for (var i = 0; i < l; i++) {
        var records = detailRecords[i].records,
            j, recordslength = records.length;
        for (j = 0; j < recordslength; j++) {
            var record = records[j].targetRecordAsKeyValue,
                length = record.length,
                k, isLineEntitled = false;
            var detailLineId = getItemForDetailRecordKey("Id", record).value;
            if (getQuantityField(record) == null) continue;
            /* Do not process if the line item has this value set to true */
            var usePriceBook = getItemForDetailRecordKey("Use_Price_From_Pricebook__c", record);
            var isBillable = getItemForDetailRecordKey("Is_Billable__c", record);
            if (!isBillable || !isBillable.value || isBillable.value == 'false' || isBillable.value == false) {
                isBillable = false;
            } else {
                isBillable = true;
            }
            /* Calculate the quantity */
            var quantityField = getItemForDetailRecordKey(getQuantityField(record), record);
            var calculatedQuantityField = getItemForDetailRecordKey('Billable_Quantity__c', record);
            var totalLinePriceField = getItemForDetailRecordKey(getTotalLinePriceField(record), record);
            var quantity = 0;
            try {
                quantity = parseFloat(quantityField.value);
                if (isNaN(quantity)) quantity = 0;
            } catch (e) {}
            /*end quantity*/

            /* Reset the Billing Infrormation field */
            var logField = getItemForDetailRecordKey('Billing_Information__c', record);
            logField.value = '';
            logField.value1 = '';

            if (usePriceBook != "" && (usePriceBook.value != "true" && usePriceBook.value != true)) {
                var duration = 0;
                var duration = getDuration(record, true);
                if (duration < 0) {
                    duration = quantity * 60;
                }
                quantity = (duration / 60).toFixed(3);

                var unitPriceField = getItemForDetailRecordKey(getUnitPriceField(record), record);
                var totalLinePrice = 0;
                if (unitPriceField.value)
                    totalLinePrice = parseFloat(unitPriceField.value) * quantity;

                var coverageField = getItemForDetailRecordKey("Covered__c", record);
                coverageField.value = 0;
                var discountField = getItemForDetailRecordKey("Discount__c", record);
                totalLinePrice = getBillableLinePrice(totalLinePrice, discountField, coverageField);

                totalWorkOrderPrice += parseFloat(totalLinePrice);
                calculatedQuantityField.value = quantity;
                totalLinePriceField.value = totalLinePrice;

                if (!isBillable) {
                    if (calculatedQuantityField == null || calculatedQuantityField == "")
                        record[record.length] = {
                            key: 'SVMXC__Billable_Quantity__c',
                            value: 0
                        };
                    if (totalLinePriceField == null || totalLinePriceField == "")
                        record[record.length] = {
                            key: 'SVMXC__' + getTotalLinePriceField(record),
                            value: 0
                        };
                    calculatedQuantityField.value = '0';
                    totalLinePriceField.value = '0';
                }
                continue;
            }

            var lineType = getItemForDetailRecordKey("Line_Type__c", record);
            var recordType = getItemForDetailRecordKey("RecordTypeId", record);
            var workDetailId = getItemForDetailRecordKey("Id", record);
            var productServicedId = getItemForDetailRecordKey("Work_Detail__c", record);
            var isOffline = getFromPriceBookDefinition(pb, "SVMX_OFFLINE_MODE");
            if (isOffline != null && isOffline !== undefined && isOffline.value !== undefined && isOffline.value === "TRUE") {
                workDetailId = getItemForDetailRecordKey("local_id", record);
            }
            if (productServicedId) {
                if (PSEntitled[productServicedId.value] && PSEntitled[productServicedId.value] == 'true') {
                    isLineEntitled = true;
                }
            }

            if (lineType.value == "Parts") {
                processPartLine(record, pb, recordType, {
                    quantity: quantity,
                    detailLineId: detailLineId,
                    isLineEntitled: isLineEntitled,
                    warranty: warranty,
                    so: so,
                    calculatedQuantityField: calculatedQuantityField,
                    logField: logField,
                    isBillable: isBillable
                });

            } else if (lineType.value == "Labor") {
                processLaborLine(record, pb, recordType, {
                    quantity: quantity,
                    detailLineId: detailLineId,
                    isLineEntitled: isLineEntitled,
                    warranty: warranty,
                    quantityField: quantityField,
                    so: so,
                    calculatedQuantityField: calculatedQuantityField,
                    logField: logField,
                    isBillable: isBillable
                });
            } else if (lineType.value == "Expenses") {
                processExpenseLine(record, pb, {
                    quantity: quantity,
                    warranty: warranty,
                    detailLineId: detailLineId,
                    isLineEntitled: isLineEntitled,
                    quantityField: quantityField,
                    so: so,
                    calculatedQuantityField: calculatedQuantityField,
                    logField: logField,
                    isBillable: isBillable
                });

            } else if (lineType.value == "Travel") {
                if (processTravelLines || !isLineEntitled)
                    processTravelLine(record, pb, {
                        appliedTravelPolicy: appliedTravelPolicy,
                        quantity: quantity,
                        isLineEntitled: isLineEntitled,
                        warranty: warranty,
                        quantityField: quantityField,
                        so: so,
                        calculatedQuantityField: calculatedQuantityField,
                        logField: logField,
                        isBillable: isBillable
                    });
                else
                    clearTravelLine(record, pb, {
                        calculatedQuantityField: calculatedQuantityField
                    });
            }
            if (!isBillable) {
                if (calculatedQuantityField == null || calculatedQuantityField == "")
                    record[record.length] = {
                        key: 'SVMXC__Billable_Quantity__c',
                        value: 0
                    };
                if (totalLinePriceField == null || totalLinePriceField == "")
                    record[record.length] = {
                        key: 'SVMXC__' + getTotalLinePriceField(record),
                        value: 0
                    };
                calculatedQuantityField.value = '0';
                totalLinePriceField.value = '0';
                continue;
            }
        }
    }

    totalWorkOrderPrice = getOnlyPositiveValue(totalWorkOrderPrice);
    if (pricingRuleInfo) {
        var appliedPricingRule = executePricingRules(pricingRuleInfo, pb, wo);
        var woTotal = getItemForDetailRecordKey('Proforma_Invoice_Amount__c', woContext);
        if (woTotal == null || woTotal == '') {
            woTotal = woContext[woContext.length] = {
                key: 'SVMXC__Proforma_Invoice_Amount__c',
                value: 0,
                value1: 0
            };
        }
        if (appliedPricingRule && appliedPricingRule[getFieldAPI("Rate__c")]) {
            var unit = appliedPricingRule[getQualifiedFieldName("Rate_Type__c")];
            if (unit == "NTE") {
                if (appliedPricingRule[getFieldAPI("Rate__c")] < totalWorkOrderPrice)
                    woTotal.value = appliedPricingRule[getFieldAPI("Rate__c")];
                else
                    woTotal.value = totalWorkOrderPrice;
            } else if (unit == "Minimum") {
                if (appliedPricingRule[getFieldAPI("Rate__c")] > totalWorkOrderPrice)
                    woTotal.value = appliedPricingRule[getFieldAPI("Rate__c")];
                else
                    woTotal.value = totalWorkOrderPrice;
            } else if (unit == "Surcharge") {
                var surchargeRate = appliedPricingRule[getFieldAPI("Rate__c")];
                if (surchargeRate !== undefined && surchargeRate !== null && typeof(surchargeRate) === "string") surchargeRate = parseFloat(surchargeRate);
                woTotal.value = totalWorkOrderPrice + surchargeRate;
            }
        } else {
            woTotal.value = totalWorkOrderPrice;
        }
    } else {
        var woTotal = getItemForDetailRecordKey('Proforma_Invoice_Amount__c', woContext);
        if (woTotal == null || woTotal == '') {
            woTotal = woContext[woContext.length] = {
                key: 'SVMXC__Proforma_Invoice_Amount__c',
                value: 0,
                value1: 0
            };
        }
        woTotal.value = totalWorkOrderPrice
    }

    return true;
}

/**
 * Snippet start.
 * @param context the transaction data context. Note that 'context' is a pre-defined variable, defined by the 
 *        expression engine. Do not overwrite!
 * @param callback function called back once the price book definition is obtained
 * @return the modified transaction context
 */
$EXPR.getPricingDefinition(context, function(pb) {
try {

    if (!pb) {
        $EXPR.Logger.error("Could not get the price book definition!");

        $RETURN(context);
    } else {

        if (applyPriceBook(context, pb)) {

            $RETURN(context);
        }
    }
} catch (e) {

    $EXPR.Logger.error("There was an error while performing get price => " + e);

    $RETURN(context);
}
});
})();