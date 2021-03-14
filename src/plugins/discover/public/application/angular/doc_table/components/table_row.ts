/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { find, template } from 'lodash';
import $ from 'jquery';
import openRowHtml from './table_row/open.html';
import detailsHtml from './table_row/details.html';
import { dispatchRenderComplete } from '../../../../../../kibana_utils/public';
import { DOC_HIDE_TIME_COLUMN_SETTING } from '../../../../../common';
import cellTemplateHtml from '../components/table_row/cell.html';
import truncateByHeightTemplateHtml from '../components/table_row/truncate_by_height.html';
import { getServices } from '../../../../kibana_services';
import { getContextUrl } from '../../../helpers/get_context_url';
import { formatRow, formatTopLevelObject } from '../../helpers';
// GPS-DFIR Modification
import {send} from '../../../../../../console/public'

const TAGS_WITH_WS = />\s+</g;

/**
 * Remove all of the whitespace between html tags
 * so that inline elements don't have extra spaces.
 */
export function noWhiteSpace(html: string): string {
  return html.replace(TAGS_WITH_WS, '><');
}

// guesstimate at the minimum number of chars wide cells in the table should be
const MIN_LINE_LENGTH = 20;

interface LazyScope extends ng.IScope {
  [key: string]: any;
}

export function createTableRowDirective($compile: ng.ICompileService) {
  const cellTemplate = template(noWhiteSpace(cellTemplateHtml));
  const truncateByHeightTemplate = template(noWhiteSpace(truncateByHeightTemplateHtml));

  return {
    restrict: 'A',
    scope: {
      columns: '=',
      filter: '=',
      indexPattern: '=',
      row: '=kbnTableRow',
      onAddColumn: '=?',
      onRemoveColumn: '=?',
      useNewFieldsApi: '<',
    },
    link: ($scope: LazyScope, $el: JQuery) => {
      $el.after('<tr data-test-subj="docTableDetailsRow" class="kbnDocTableDetails__row">');
      $el.empty();

      // when we compile the details, we use this $scope
      let $detailsScope: LazyScope;

      // when we compile the toggle button in the summary, we use this $scope
      let $toggleScope;

      // toggle display of the rows details, a full list of the fields from each row
      $scope.toggleRow = () => {
        const $detailsTr = $el.next();

        $scope.open = !$scope.open;

        ///
        // add/remove $details children
        ///

        $detailsTr.toggle($scope.open);

        if (!$scope.open) {
          // close the child scope if it exists
          $detailsScope.$destroy();
          // no need to go any further
          return;
        } else {
          $detailsScope = $scope.$new();
        }

        // empty the details and rebuild it
        $detailsTr.html(detailsHtml);
        $detailsScope.row = $scope.row;
        $detailsScope.hit = $scope.row;
        $detailsScope.uriEncodedId = encodeURIComponent($detailsScope.hit._id);

        $compile($detailsTr)($detailsScope);
      };

      $scope.$watchMulti(['indexPattern.timeFieldName', 'row.highlight', '[]columns'], () => {
        createSummaryRow($scope.row);
      });

      $scope.inlineFilter = function inlineFilter($event: any, type: string) {
        const column = $($event.currentTarget).data().column;
        const field = $scope.indexPattern.fields.getByName(column);
        $scope.filter(field, $scope.flattenedRow[column], type);
      };

      $scope.getContextAppHref = () => {
        return getContextUrl(
          $scope.row._id,
          $scope.indexPattern.id,
          $scope.columns,
          getServices().filterManager,
          getServices().addBasePath
        );
      };

      $scope.getSingleDocHref = () => {
        return getServices().addBasePath(
          `/app/discover#/doc/${$scope.indexPattern.id}/${
            $scope.row._index
          }?id=${encodeURIComponent($scope.row._id)}`
        );
      };

      // create a tr element that lists the value for each *column*
      function createSummaryRow(row: any) {
        const indexPattern = $scope.indexPattern;
        $scope.flattenedRow = indexPattern.flattenHit(row);
        // GPS-DFIR Modification
        indexPattern.irstatus = true;
        // We just create a string here because its faster.
        const newHtmls = [openRowHtml];

        const mapping = indexPattern.fields.getByName;
        const hideTimeColumn = getServices().uiSettings.get(DOC_HIDE_TIME_COLUMN_SETTING, false);
        // GPS-DFIR Modification
        if (indexPattern.timeFieldName && !hideTimeColumn) {
          newHtmls.push(
            cellTemplate({
              timefield: true,
              irstatus: true,
              sourcefield: false,
              formatted: _displayField(row, indexPattern.timeFieldName),
              filterable: mapping(indexPattern.timeFieldName).filterable && $scope.filter,
              column: indexPattern.timeFieldName,
            })
          );
        }

        // GPS-DFIR Modification
        if ($scope.flattenedRow['gpsdfir_status'] == 'malicious') {
          $scope.irstatus = true;
        } else if ($scope.flattenedRow['gpsdfir_status'] == 'unknown') {
          $scope.irstatus = false;
        }

        $scope.toggleStatus = function toggleStatus() {
          const method = "POST";
          const path = $scope.row._index + "/_update_by_query";
          const data =  "{\n" +
                        "  \"script\": {\n" +
                        "    \"inline\": \"if (ctx._source.gpsdfir_status == \\\"malicious\\\"){ctx._source.gpsdfir_status = \\\"unknown\\\"} else {ctx._source.gpsdfir_status = \\\"malicious\\\"}\"," +
                        "    \"lang\": \"painless\"\n" +
                        "  },\n" +
                        "  \"query\": {\n" +
                        "    \"match\": {\n" +
                        "      \"_id\": \"" + $scope.row._id + "\"\n" +
                        "    }\n" +
                        "  }\n" +
                        "}\n";
          console.log("Query-on-click: " + method + " " + path + " " + data);
          console.log("Method:" + method);
          console.log("Path:" + path);
          console.log("Data:" + data)
          return send(method,path,data);
        }
        console.log(indexPattern.fields.byName[$scope.row,'gpsdfir_status']);
        console.log($scope.indexPattern.irstatus)
        console.log(_displayField(row, 'gpsdfir_status'));
        console.log($scope.flattenedRow['gpsdfir_status']);
        newHtmls.push(cellTemplate({
          irstatus: true,
          timefield: false,
          sourcefield: true,
          formatted: '<button class="kuiButton" ng-click="$parent.irstatus = !$parent.irstatus" ng-class="{  \'kuiButton--danger\': $parent.irstatus, \'kuiButton--basic\': !$parent.irstatus }"><span class="kuiButton__icon kuiIcon fa-plus"></span></button>',
          filterable: false,
          column: 'gpsdfir_status'
        }));
        // GPS-DFIR Modification End

        if ($scope.columns.length === 0 && $scope.useNewFieldsApi) {
          const formatted = formatRow(row, indexPattern);

          newHtmls.push(
            cellTemplate({
              timefield: false,
              irstatus: false,
              sourcefield: true,
              formatted,
              filterable: false,
              column: '__document__',
            })
          );
        } else {
          $scope.columns.forEach(function (column: string) {
            const isFilterable = mapping(column) && mapping(column).filterable && $scope.filter;
            if ($scope.useNewFieldsApi && !mapping(column) && !row.fields[column]) {
              const innerColumns = Object.fromEntries(
                Object.entries(row.fields).filter(([key]) => {
                  return key.indexOf(`${column}.`) === 0;
                })
              );
              newHtmls.push(
                cellTemplate({
                  timefield: false,
                  irstatus: false,
                  sourcefield: true,
                  formatted: formatTopLevelObject(row, innerColumns, indexPattern),
                  filterable: false,
                  column,
                })
              );
            } else {
              newHtmls.push(
                cellTemplate({
                  timefield: false,
                  irstatus: false,
                  sourcefield: column === '_source',
                  formatted: _displayField(row, column, true),
                  filterable: isFilterable,
                  column,
                })
              );
            }
          });
        }

        let $cells = $el.children();
        newHtmls.forEach(function (html, i) {
          const $cell = $cells.eq(i);
          if ($cell.data('discover:html') === html) return;

          const reuse = find($cells.slice(i + 1), function (cell: any) {
            return $.data(cell, 'discover:html') === html;
          });

          const $target = reuse ? $(reuse).detach() : $(html);
          $target.data('discover:html', html);
          const $before = $cells.eq(i - 1);
          if ($before.length) {
            $before.after($target);
          } else {
            $el.append($target);
          }

          // rebuild cells since we modified the children
          $cells = $el.children();

          if (!reuse) {
            $toggleScope = $scope.$new();
            $compile($target)($toggleScope);
          }
        });

        if ($scope.open) {
          $detailsScope.row = row;
        }

        // trim off cells that were not used rest of the cells
        $cells.filter(':gt(' + (newHtmls.length - 1) + ')').remove();
        dispatchRenderComplete($el[0]);
      }

      /**
       * Fill an element with the value of a field
       */
      function _displayField(row: any, fieldName: string, truncate = false) {
        const indexPattern = $scope.indexPattern;
        const text = indexPattern.formatField(row, fieldName);

        if (truncate && text.length > MIN_LINE_LENGTH) {
          return truncateByHeightTemplate({
            body: text,
          });
        }

        return text;
      }
    },
  };
}
