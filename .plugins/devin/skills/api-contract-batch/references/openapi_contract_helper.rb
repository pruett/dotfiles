# frozen_string_literal: true

require 'yaml'
require 'openapi_parser'

# Validates the last integration response against swagger/v1/openapi.yml.
# Undeclared keys pass unless the schema sets `additionalProperties: false`;
# a status code the operation doesn't document fails.
module OpenapiContractHelper
  def self.spec
    @spec ||= OpenAPIParser.parse(
      YAML.load_file(Rails.root.join('swagger/v1/openapi.yml')),
      strict_reference_validation: true,
      strict_response_validation: true
    )
  end

  def assert_matches_openapi(method = request.request_method, path = request.path)
    operation = OpenapiContractHelper.spec.request_operation(method.to_s.downcase, path)
    assert operation, "No OpenAPI operation for #{method.to_s.upcase} #{path}"

    body = response.body.presence && JSON.parse(response.body)
    validatable = OpenAPIParser::RequestOperation::ValidatableResponseBody.new(
      response.status, body, response.headers.to_h
    )
    operation.validate_response_body(validatable)
  rescue OpenAPIParser::OpenAPIError => e
    flunk "#{method.to_s.upcase} #{path} (#{response.status}) doesn't match OpenAPI: #{e.message}"
  end
end
